from __future__ import annotations

"""
SymPy Engine (Browser/Pyodide Compatible)
=========================================

Purpose
-------
A simplified wrapper around SymPy computations suitable for use in Pyodide.
It removes multiprocessing and file-system dependency in favor of direct
execution in the browser's main thread (or web worker).

Public API
----------
- Data models (Pydantic):
    * ComputeRequest, ComputeResponse, BatchRequest
- Engine:
    * class SympyEngine
        - compute(req: ComputeRequest) -> ComputeResponse
        - batch(req: BatchRequest) -> list[dict]
    * get_engine() -> SympyEngine
"""

from typing import Any, Dict, List, Literal, Optional, Set, Union
import importlib
import json
import sympy as sp
from pydantic import BaseModel, Field

# ----------------------------------------------------------------------------
# Dynamic task discovery (Runtime only for browser)
# ----------------------------------------------------------------------------

def _discover_sympy_tasks_fallback() -> list[str]:
    tasks: list[str] = []
    for name in dir(sp):
        if name.startswith("_"):
            continue
        obj = getattr(sp, name, None)
        if callable(obj):
            tasks.append(name)
    # Friendly aliases (mapped later)
    tasks.extend(["differentiate", "derivative", "d"])
    return sorted(set(tasks))

TASKS: list[str] = _discover_sympy_tasks_fallback()

# ----------------------------------------------------------------------------
# Safety: allowlist for sympify context
# ----------------------------------------------------------------------------
_ALLOWED: Dict[str, Any] = {
    "Symbol": sp.Symbol,
    "symbols": sp.symbols,
    "Eq": sp.Eq,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "pi": sp.pi,
    "E": sp.E,
    "I": sp.I,
    "Abs": sp.Abs,
    "Matrix": sp.Matrix,
    "Integral": sp.Integral,
    "Derivative": sp.Derivative,
    "diff": sp.diff,
    "integrate": sp.integrate,
    "simplify": sp.simplify,
    "expand": sp.expand,
    "factor": sp.factor,
    "collect": sp.collect,
    "cancel": sp.cancel,
    "apart": sp.apart,
    "together": sp.together,
    "trigsimp": sp.trigsimp,
    "ratsimp": sp.ratsimp,
    "transpose": sp.transpose,
}

# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------

class ComputeRequest(BaseModel):
    expr: str = Field(..., description="Math expression in SymPy syntax.")
    task: str = Field(..., description="SymPy operation to perform (validated at runtime).")
    var: Optional[str] = Field(None, description="Variable for diff/integrate/solve (e.g., 'x').")
    subs: Optional[Dict[str, float]] = Field(
        default=None, description="Substitutions for evalf/simplify (e.g., {'x': 1.23})"
    )
    solve_for: Optional[str] = Field(None, description="Variable to solve for (defaults to 'var').")
    timeout_sec: float = Field(2.0, ge=0.1, le=60.0, description="Computation timeout per request (ignored in sync pyodide).")
    series_order: Optional[int] = Field(6, ge=1, le=50, description="Truncation order for 'series' task (default 6).")
    kwargs: Dict[str, Any] = Field(default_factory=dict, description="Additional keyword arguments for SymPy calls.")
    args: Optional[List[Any]] = Field(default=None, description="Generic positional arguments for the task. Strings are sympified.")

class ComputeResponse(BaseModel):
    result_str: str
    result_latex: Optional[str] = None
    meta: Dict[str, Any] = {}

class BatchRequest(BaseModel):
    items: List[ComputeRequest]

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _resolve_sympy_callable(op: str):
    """
    Resolve a SymPy callable by name. Supports both top-level names (e.g., "diff")
    and qualified dotted paths (e.g., "vector.laplacian"). Returns the callable
    or None if it cannot be resolved safely.
    """
    if not isinstance(op, str) or not op.strip():
        return None
    name = op.strip()

    # Aliases
    alias_map = {
        "differentiate": "diff",
        "derivative": "diff",
        "d": "diff",
        "laplace": "laplace_transform",
        "invlaplace": "inverse_laplace_transform",
        "fourier": "fourier_transform",
        "invfourier": "inverse_fourier_transform",
        "z": "ztransform",
        "invz": "inverse_ztransform",
    }
    name = alias_map.get(name, name)

    base_mod = sp

    # Fast path: top-level attribute on sympy
    if hasattr(base_mod, name):
        obj = getattr(base_mod, name, None)
        return obj if callable(obj) else None

    # Qualified path: try to import submodule(s) and retrieve attribute
    parts = name.split(".")
    if len(parts) > 1:
        mod_path = "sympy." + ".".join(parts[:-1])
        attr_name = parts[-1]
        try:
            importlib.import_module(mod_path)
        except Exception:
            return None
        try:
            mod = importlib.import_module(mod_path)
            obj = getattr(mod, attr_name, None)
            if callable(obj):
                return obj
        except Exception:
            return None
        # Fallback: traverse from the sympy package root via getattr chain
        try:
            obj_any = base_mod
            for p in parts:
                obj_any = getattr(obj_any, p)
            return obj_any if callable(obj_any) else None
        except Exception:
            return None
    return None

def _predeclare_symbols(names: Set[str]) -> Dict[str, Any]:
    locals_dict = dict(_ALLOWED)
    if names:
        syms = sp.symbols(sorted(names))
        if isinstance(syms, tuple):
            for s in syms:
                locals_dict[str(s)] = s
        else:
            locals_dict[str(syms)] = syms
    return locals_dict


def _parse_expr(expr: str, sym_names: Set[str]) -> sp.Expr:
    return sp.sympify(expr, locals=_predeclare_symbols(sym_names), evaluate=True)

def _parse_arg(arg: Any, sym_names: Set[str]) -> Any:
    """
    Recursively parse arguments.
    - Strings are attempted to be sympified.
    - Lists are converted to tuples (SymPy usually expects tuples for bounds etc.)
    """
    if isinstance(arg, str):
        # Try to sympify, if fail, keep as string (some args might be string literals)
        try:
            return sp.sympify(arg, locals=_predeclare_symbols(sym_names))
        except Exception:
            return arg
    elif isinstance(arg, list):
        return tuple(_parse_arg(a, sym_names) for a in arg)
    elif isinstance(arg, dict):
         return {k: _parse_arg(v, sym_names) for k, v in arg.items()}
    else:
        return arg

# ----------------------------------------------------------------------------
# Compute Core
# ----------------------------------------------------------------------------

def _do_compute(payload: ComputeRequest) -> ComputeResponse:
    # Symbols from inputs
    sym_names: Set[str] = set()
    if payload.subs:
        sym_names.update(payload.subs.keys())
    if payload.var:
        sym_names.add(payload.var)
    if payload.solve_for:
        sym_names.add(payload.solve_for)

    # Heuristic: Scan args for potential symbol names if they are simple strings
    if payload.args:
        for a in payload.args:
             if isinstance(a, str) and a.isidentifier():
                 sym_names.add(a)
             elif isinstance(a, list):
                 for sub_a in a:
                     if isinstance(sub_a, str) and sub_a.isidentifier():
                         sym_names.add(sub_a)

    expr = _parse_expr(payload.expr, sym_names)

    # Task dispatch
    res: Any = None
    meta: Dict[str, Any] = {}

    v = sp.Symbol(payload.var) if payload.var else None
    s_for = sp.Symbol(payload.solve_for) if payload.solve_for else (v if v else None)

    # Legacy explicit handling for special formatting or complex logic
    # We keep these for backward compatibility and specific behaviors (like limit fallback)

    # ... but if 'args' is present, we prefer the generic path for most things unless it's a special logic case.

    if payload.task == "simplify" and not payload.args:
        res = sp.simplify(expr)
        if payload.subs:
            res = res.subs({sp.Symbol(k): val for k, val in payload.subs.items()})

    elif payload.task == "expand" and not payload.args:
        res = sp.expand(expr)

    elif payload.task == "factor" and not payload.args:
        res = sp.factor(expr)

    elif payload.task == "collect" and not payload.args:
        if v is None:
            raise ValueError("Provide 'var' for collect.")
        res = sp.collect(expr, v)

    elif payload.task == "cancel" and not payload.args:
        res = sp.cancel(expr)

    elif payload.task == "apart" and not payload.args:
        res = sp.apart(expr, v) if v is not None else sp.apart(expr)

    elif payload.task == "together" and not payload.args:
        res = sp.together(expr)

    elif payload.task == "trigsimp" and not payload.args:
        res = sp.trigsimp(expr)

    elif payload.task == "ratsimp" and not payload.args:
        res = sp.ratsimp(expr)

    elif payload.task == "solve" and not payload.args:
        target = expr if isinstance(expr, sp.Equality) else sp.Eq(expr, 0)
        if s_for is None:
            free = sorted(expr.free_symbols, key=lambda x: x.name)
            if not free:
                # raise ValueError("No variable to solve for; provide 'solve_for' or 'var'.")
                # Fallback to generic solve which might handle it
                pass
            else:
                s_for = free[0]

        if s_for:
            res = sp.solve(target, s_for, dict=True)

    elif payload.task == "diff" and not payload.args:
        if v is None:
            raise ValueError("Provide 'var' for differentiation.")
        res = sp.diff(expr, v)

    elif payload.task == "integrate" and not payload.args:
        if v is None:
            raise ValueError("Provide 'var' for integration.")
        res = sp.integrate(expr, v)

    elif payload.task == "evalf":
        if payload.subs:
            expr = expr.subs({sp.Symbol(k): val for k, val in payload.subs.items()})
        res = sp.N(expr)

    elif payload.task == "limit" and not payload.args:
        sym = v or (sorted(expr.free_symbols, key=lambda x: x.name)[0] if expr.free_symbols else sp.Symbol("x"))
        point = payload.subs.get(str(sym), 0) if payload.subs else 0
        meta["limit_point"] = point
        # Do NOT substitute the limit variable before taking the limit (avoids 0/0 -> NaN)
        other_subs = {sp.Symbol(k): val for k, val in (payload.subs or {}).items() if k != str(sym)}
        expr2 = expr.subs(other_subs)
        direction = payload.kwargs.get("dir") if isinstance(payload.kwargs, dict) else None
        if direction is not None:
            res = sp.limit(expr2, sym, point, dir=str(direction))
        else:
            res = sp.limit(expr2, sym, point)

    elif payload.task == "series" and not payload.args:
        sym = v or (sorted(expr.free_symbols, key=lambda x: x.name)[0] if expr.free_symbols else sp.Symbol("x"))
        order = int(payload.series_order or 6)
        center = (payload.subs or {}).get(str(sym), 0)
        res = sp.series(expr, sym, center, order).removeO()

    elif payload.task == "subs":
        if not payload.subs and not payload.args:
             raise ValueError("Provide 'subs' mapping for substitution.")
        if payload.subs:
             res = expr.subs({sp.Symbol(k): val for k, val in payload.subs.items()})
        else:
             # Let generic handle args based subs
             pass

    elif payload.task == "det":
        if not hasattr(expr, "det"):
            raise ValueError("Expression is not a matrix; cannot compute determinant.")
        res = expr.det()

    elif payload.task == "inv":
        if not hasattr(expr, "inv"):
            raise ValueError("Expression is not a matrix; cannot compute inverse.")
        res = expr.inv()

    elif payload.task == "transpose":
        if hasattr(expr, "T"):
            res = expr.T
        else:
            raise ValueError("Expression is not a matrix; cannot transpose.")

    # Generic Fallback / Main Path
    if res is None:
        func = _resolve_sympy_callable(payload.task)
        if func is None:
             raise ValueError(f"Unsupported SymPy operation: {payload.task}")

        # Prepare arguments
        # Always start with 'expr'
        call_args = [expr]

        # Add explicitly provided generic args
        if payload.args:
            parsed_args = [_parse_arg(a, sym_names) for a in payload.args]
            call_args.extend(parsed_args)

        # If no generic args, try legacy fallback logic (var, solve_for)
        # only if we haven't already handled it above
        elif not payload.args:
             # Legacy Fallback Logic
            sym1 = sp.Symbol(payload.var) if payload.var else None
            sym2 = sp.Symbol(payload.solve_for) if payload.solve_for else None

            # Special case for laplace transform options
            if "laplace" in payload.task:
                 payload.kwargs.setdefault("noconds", True)

            # Try to guess signature
            success = False
            last_error = None

            # 1) Try (expr, sym1, sym2, **kwargs)
            if sym1 is not None and sym2 is not None:
                try:
                    res = func(expr, sym1, sym2, **payload.kwargs)
                    success = True
                except TypeError as e:
                    last_error = e

            # 1b) Swap
            if not success and 'inverse' in payload.task and (sym1 is not None and sym2 is not None):
                try:
                    res = func(expr, sym2, sym1, **payload.kwargs)
                    success = True
                except TypeError as e:
                    last_error = e

            # 2) Try (expr, sym1)
            if not success and sym1 is not None:
                try:
                    res = func(expr, sym1, **payload.kwargs)
                    success = True
                except TypeError as e:
                    last_error = e

            # 3) Try (expr)
            if not success:
                try:
                    res = func(expr, **payload.kwargs)
                    success = True
                except Exception as e:
                    last_error = e

            if not success:
                 raise ValueError(f"Unable to call sympy.{payload.task} with provided arguments: {last_error}")

        # Execute Generic Call if we built call_args
        if res is None:
             res = func(*call_args, **payload.kwargs)

    # Serialize
    # Special handling for solve (list of dicts)
    if payload.task == "solve" and isinstance(res, list):
        result_str = str(res)
        result_latex = sp.latex(res)
    else:
        result_str = str(res)
        try:
            result_latex = (res if isinstance(res, str) else sp.latex(res)) if res is not None else None
        except:
            result_latex = result_str

    if hasattr(expr, "free_symbols"):
        meta["free_symbols"] = sorted([s.name for s in expr.free_symbols])
    else:
        meta["free_symbols"] = []

    return ComputeResponse(result_str=result_str, result_latex=result_latex, meta=meta)


# ----------------------------------------------------------------------------
# Engine
# ----------------------------------------------------------------------------

class SympyEngine:
    """
    Single-threaded SymPy engine for Pyodide.
    """

    def compute(self, req: ComputeRequest) -> ComputeResponse:
        return _do_compute(req)

    def batch(self, req: BatchRequest) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for item in req.items:
            try:
                data = _do_compute(item)
                out.append({"ok": True, "data": data.dict()}) # Pydantic v1 compat
            except Exception as e:
                out.append({"ok": False, "error": f"{type(e).__name__}: {e}"})
        return out

    @property
    def tasks(self) -> list[str]:
        return list(TASKS)

# ----------------------------------------------------------------------------
# Singleton
# ----------------------------------------------------------------------------

_engine_singleton: Optional[SympyEngine] = None

def get_engine() -> SympyEngine:
    global _engine_singleton
    if _engine_singleton is None:
        _engine_singleton = SympyEngine()
    return _engine_singleton
