"use client";
import React from "react";
export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false,msg:""}; }
  static getDerivedStateFromError(e){ return {hasError:true,msg:e?.message||String(e)}; }
  componentDidCatch(e,i){ console.error("ErrorBoundary:", e, i); }
  render(){
    return this.state.hasError
      ? <div className="max-w-2xl mx-auto mt-10 p-6 bg-red-50 text-red-700 rounded shadow">
          <h2 className="font-bold mb-2">Client-side error</h2>
          <pre className="text-xs whitespace-pre-wrap">{this.state.msg}</pre>
        </div>
      : this.props.children;
  }
}