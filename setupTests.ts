import '@testing-library/jest-dom';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: any) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // Deprecated
    removeListener: () => {}, // Deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = function() {};

// Mock global environment for API keys
(window as any).env = {
  API_KEY: 'test-api-key',
  GEMINI_API_KEY: 'test-gemini-key'
};

// Mock SpeechSynthesis
(window as any).speechSynthesis = {
  speak: () => {},
  cancel: () => {},
  getVoices: () => [],
};
(window as any).SpeechSynthesisUtterance = class {};

// Mock Math Libraries if they rely on global scripts
(window as any).nerdamer = (expr: any) => ({
    evaluate: () => ({
        text: () => "result",
        toTeX: () => "result"
    })
});
(window as any).Algebrite = {
    run: () => "result"
};