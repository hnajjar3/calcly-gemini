import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders without crashing and shows welcome message', () => {
    render(<App />);
    
    // Check for the main heading text parts
    expect(screen.getByText(/What do you want to/i)).toBeInTheDocument();
    expect(screen.getByText(/know/i)).toBeInTheDocument();
    
    // Check if sample queries are rendered
    expect(screen.getByText(/Integrate x\^2/i)).toBeInTheDocument();
    
    // Check if input is present
    const input = screen.getByPlaceholderText(/Ask complex questions/i);
    expect(input).toBeInTheDocument();
  });
});