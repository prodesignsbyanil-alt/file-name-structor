"use client";
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError: false, message: "" }; }
  static getDerivedStateFromError(error){ return { hasError: true, message: error?.message || String(error) }; }
  componentDidCatch(error, info){ console.error("ErrorBoundary caught:", error, info); }
  render(){
    if(this.state.hasError){
      return (
        <div className="max-w-2xl mx-auto mt-10 p-6 bg-red-50 text-red-700 rounded shadow">
          <h2 className="font-bold mb-2">Client-side error</h2>
          <pre className="text-xs whitespace-pre-wrap">{this.state.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}