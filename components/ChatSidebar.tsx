import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Code2 } from 'lucide-react';

interface Message {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: number;
}

interface ChatSidebarProps {
    messages: Message[];
    onSendMessage: (text: string, images?: string[]) => void;
    onReviewCode: () => void;
    isProcessing: boolean;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ messages, onSendMessage, onReviewCode, isProcessing }) => {
    const [input, setInput] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null); // Base64 string
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((input.trim() || selectedImage) && !isProcessing) {
            onSendMessage(input, selectedImage ? [selectedImage] : undefined);
            setInput('');
            setSelectedImage(null);
        }
    };

    const handleMicClick = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert('Voice input is not supported in this browser.');
            return;
        }

        if (isRecording) return;

        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setIsRecording(true);
        recognition.onend = () => setIsRecording(false);
        recognition.onerror = () => setIsRecording(false);

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInput(prev => prev + (prev ? ' ' : '') + transcript);
        };

        recognition.start();
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setSelectedImage(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-800 border-r border-slate-700 w-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <Bot className="w-4 h-4 text-indigo-400" /> AI Assistant
                </h2>
                <button
                    onClick={onReviewCode}
                    disabled={isProcessing}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                    <Code2 className="w-3 h-3" /> Review Code
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-slate-500 mt-10 text-sm italic">
                        Start a conversation or click "Review Code" to discuss the current script.
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'user' ? 'bg-slate-600' : 'bg-indigo-600'}`}>
                            {msg.sender === 'user' ? <User className="w-4 h-4 text-slate-300" /> : <Bot className="w-4 h-4 text-white" />}
                        </div>
                        <div className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed shadow-sm ${msg.sender === 'user' ? 'bg-slate-700 text-slate-100 rounded-tr-none' : 'bg-slate-900 text-slate-200 border border-slate-700 rounded-tl-none'}`}>
                            {msg.text}
                            {/* Simple hack to show image indicator if needed, but for now just text */}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-700 bg-slate-900/50">
                {/* Image Preview */}
                {selectedImage && (
                    <div className="mb-2 relative inline-block">
                        <img src={selectedImage} alt="Upload" className="h-16 w-16 object-cover rounded-md border border-slate-600" />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md"
                        >
                            ×
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <div className="relative flex items-center gap-2">
                        {/* Camera Button */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-slate-400 hover:text-indigo-400 p-2 transition-colors"
                            title="Upload Image"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageUpload}
                        />

                        {/* Mic Button */}
                        <button
                            type="button"
                            onClick={handleMicClick}
                            className={`p-2 transition-colors ${isRecording ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:text-indigo-400'}`}
                            title="Voice Input"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                        </button>

                        <div className="relative flex-grow">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isProcessing}
                                placeholder={isProcessing ? "AI is thinking..." : isRecording ? "Listening..." : "Ask (Text, Voice, Image)..."}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-4 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={(!input.trim() && !selectedImage) || isProcessing}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-400 disabled:opacity-30 transition-colors p-1"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
