"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  GripHorizontal,
  Terminal,
  ZoomIn,
  ZoomOut,
  Copy,
  ClipboardPaste,
  CheckSquare,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useAppStore } from "@/store/app-store";
import { getTerminalTheme } from "@/config/terminal-themes";

// Font size constraints
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const DEFAULT_FONT_SIZE = 14;

// Resize constraints
const RESIZE_DEBOUNCE_MS = 100; // Short debounce for responsive feel

interface TerminalPanelProps {
  sessionId: string;
  authToken: string | null;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

// Type for xterm Terminal - we'll use any since we're dynamically importing
type XTerminal = InstanceType<typeof import("@xterm/xterm").Terminal>;
type XFitAddon = InstanceType<typeof import("@xterm/addon-fit").FitAddon>;

export function TerminalPanel({
  sessionId,
  authToken,
  isActive,
  onFocus,
  onClose,
  onSplitHorizontal,
  onSplitVertical,
  isDragging = false,
  isDropTarget = false,
  fontSize,
  onFontSizeChange,
}: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<XFitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastShortcutTimeRef = useRef<number>(0);
  const resizeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const focusHandlerRef = useRef<{ dispose: () => void } | null>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [shellName, setShellName] = useState("shell");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isMac, setIsMac] = useState(false);
  const isMacRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const focusedMenuIndexRef = useRef(0);

  // Detect platform on mount
  useEffect(() => {
    // Use modern userAgentData API with fallback to navigator.platform
    const nav = navigator as Navigator & { userAgentData?: { platform: string } };
    let detected = false;
    if (nav.userAgentData?.platform) {
      detected = nav.userAgentData.platform.toLowerCase().includes("mac");
    } else if (typeof navigator !== "undefined") {
      // Fallback for browsers without userAgentData (intentionally using deprecated API)
      detected = /mac/i.test(navigator.platform);
    }
    setIsMac(detected);
    isMacRef.current = detected;
  }, []);

  // Get effective theme from store
  const getEffectiveTheme = useAppStore((state) => state.getEffectiveTheme);
  const effectiveTheme = getEffectiveTheme();

  // Use refs for callbacks and values to avoid effect re-runs
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSplitHorizontalRef = useRef(onSplitHorizontal);
  onSplitHorizontalRef.current = onSplitHorizontal;
  const onSplitVerticalRef = useRef(onSplitVertical);
  onSplitVerticalRef.current = onSplitVertical;
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const themeRef = useRef(effectiveTheme);
  themeRef.current = effectiveTheme;
  const copySelectionRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const pasteFromClipboardRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Zoom functions - use the prop callback
  const zoomIn = useCallback(() => {
    onFontSizeChange(Math.min(fontSize + 1, MAX_FONT_SIZE));
  }, [fontSize, onFontSizeChange]);

  const zoomOut = useCallback(() => {
    onFontSizeChange(Math.max(fontSize - 1, MIN_FONT_SIZE));
  }, [fontSize, onFontSizeChange]);

  const resetZoom = useCallback(() => {
    onFontSizeChange(DEFAULT_FONT_SIZE);
  }, [onFontSizeChange]);

  // Copy selected text to clipboard
  const copySelection = useCallback(async (): Promise<boolean> => {
    const terminal = xtermRef.current;
    if (!terminal) return false;

    const selection = terminal.getSelection();
    if (!selection) return false;

    try {
      await navigator.clipboard.writeText(selection);
      return true;
    } catch (err) {
      console.error("[Terminal] Copy failed:", err);
      return false;
    }
  }, []);
  copySelectionRef.current = copySelection;

  // Paste from clipboard
  const pasteFromClipboard = useCallback(async () => {
    const terminal = xtermRef.current;
    if (!terminal || !wsRef.current) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data: text }));
      }
    } catch (err) {
      console.error("[Terminal] Paste failed:", err);
    }
  }, []);
  pasteFromClipboardRef.current = pasteFromClipboard;

  // Select all terminal content
  const selectAll = useCallback(() => {
    xtermRef.current?.selectAll();
  }, []);

  // Clear terminal
  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear();
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle context menu action
  const handleContextMenuAction = useCallback(async (action: "copy" | "paste" | "selectAll" | "clear") => {
    closeContextMenu();
    switch (action) {
      case "copy":
        await copySelection();
        break;
      case "paste":
        await pasteFromClipboard();
        break;
      case "selectAll":
        selectAll();
        break;
      case "clear":
        clearTerminal();
        break;
    }
    xtermRef.current?.focus();
  }, [closeContextMenu, copySelection, pasteFromClipboard, selectAll, clearTerminal]);

  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3008";
  const wsUrl = serverUrl.replace(/^http/, "ws");

  // Draggable - only the drag handle triggers drag
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: sessionId,
  });

  // Droppable - the entire panel is a drop target
  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({
    id: sessionId,
  });

  // Initialize terminal - dynamically import xterm to avoid SSR issues
  useEffect(() => {
    if (!terminalRef.current) return;

    let mounted = true;

    const initTerminal = async () => {
      // Dynamically import xterm modules
      const [
        { Terminal },
        { FitAddon },
        { WebglAddon },
      ] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-webgl"),
      ]);

      // Also import CSS
      await import("@xterm/xterm/css/xterm.css");

      if (!mounted || !terminalRef.current) return;

      // Get terminal theme matching the app theme
      const terminalTheme = getTerminalTheme(themeRef.current);

      // Create terminal instance with the current global font size and theme
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize: fontSizeRef.current,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        theme: terminalTheme,
        allowProposedApi: true,
      });

      // Create fit addon
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Open terminal
      terminal.open(terminalRef.current);

      // Try to load WebGL addon for better performance
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        terminal.loadAddon(webglAddon);
      } catch {
        console.warn("[Terminal] WebGL addon not available, falling back to canvas");
      }

      // Fit terminal to container - wait for stable dimensions
      // Use multiple RAFs to let react-resizable-panels finish layout
      let fitAttempts = 0;
      const MAX_FIT_ATTEMPTS = 5;
      let lastWidth = 0;
      let lastHeight = 0;

      const attemptFit = () => {
        if (!fitAddon || !terminalRef.current || fitAttempts >= MAX_FIT_ATTEMPTS) return;

        const rect = terminalRef.current.getBoundingClientRect();
        fitAttempts++;

        // Check if dimensions are stable (same as last attempt) and valid
        if (
          rect.width === lastWidth &&
          rect.height === lastHeight &&
          rect.width > 0 &&
          rect.height > 0
        ) {
          try {
            fitAddon.fit();
          } catch (err) {
            console.error("[Terminal] Initial fit error:", err);
          }
          return;
        }

        // Dimensions still changing or too small, try again
        lastWidth = rect.width;
        lastHeight = rect.height;
        requestAnimationFrame(attemptFit);
      };

      requestAnimationFrame(attemptFit);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setIsTerminalReady(true);

      // Handle focus - use ref to avoid re-running effect
      // Store disposer to prevent memory leak
      focusHandlerRef.current = terminal.onData(() => {
        onFocusRef.current();
      });

      // Custom key handler to intercept terminal shortcuts
      // Return false to prevent xterm from handling the key
      const SHORTCUT_COOLDOWN_MS = 300; // Prevent rapid firing

      terminal.attachCustomKeyEventHandler((event) => {
        // Only intercept keydown events
        if (event.type !== 'keydown') return true;

        // Check cooldown to prevent rapid terminal creation
        const now = Date.now();
        const canTrigger = now - lastShortcutTimeRef.current > SHORTCUT_COOLDOWN_MS;

        // Use event.code for keyboard-layout-independent key detection
        const code = event.code;

        // Alt+D - Split right
        if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && code === 'KeyD') {
          event.preventDefault();
          if (canTrigger) {
            lastShortcutTimeRef.current = now;
            onSplitHorizontalRef.current();
          }
          return false;
        }

        // Alt+S - Split down
        if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && code === 'KeyS') {
          event.preventDefault();
          if (canTrigger) {
            lastShortcutTimeRef.current = now;
            onSplitVerticalRef.current();
          }
          return false;
        }

        // Alt+W - Close terminal
        if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && code === 'KeyW') {
          event.preventDefault();
          if (canTrigger) {
            lastShortcutTimeRef.current = now;
            onCloseRef.current();
          }
          return false;
        }

        const modKey = isMacRef.current ? event.metaKey : event.ctrlKey;
        const otherModKey = isMacRef.current ? event.ctrlKey : event.metaKey;

        // Ctrl+Shift+C / Cmd+Shift+C - Always copy (Linux terminal convention)
        if (modKey && !otherModKey && event.shiftKey && !event.altKey && code === 'KeyC') {
          event.preventDefault();
          copySelectionRef.current();
          return false;
        }

        // Ctrl+C / Cmd+C - Copy if text is selected, otherwise send SIGINT
        if (modKey && !otherModKey && !event.shiftKey && !event.altKey && code === 'KeyC') {
          const hasSelection = terminal.hasSelection();
          if (hasSelection) {
            event.preventDefault();
            copySelectionRef.current();
            terminal.clearSelection();
            return false;
          }
          // No selection - let xterm handle it (sends SIGINT)
          return true;
        }

        // Ctrl+V / Cmd+V or Ctrl+Shift+V / Cmd+Shift+V - Paste
        if (modKey && !otherModKey && !event.altKey && code === 'KeyV') {
          event.preventDefault();
          pasteFromClipboardRef.current();
          return false;
        }

        // Ctrl+A / Cmd+A - Select all
        if (modKey && !otherModKey && !event.shiftKey && !event.altKey && code === 'KeyA') {
          event.preventDefault();
          terminal.selectAll();
          return false;
        }

        // Let xterm handle all other keys
        return true;
      });
    };

    initTerminal();

    // Cleanup
    return () => {
      mounted = false;

      // Dispose focus handler to prevent memory leak
      if (focusHandlerRef.current) {
        focusHandlerRef.current.dispose();
        focusHandlerRef.current = null;
      }

      // Clear resize debounce timer
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      fitAddonRef.current = null;
      setIsTerminalReady(false);
    };
  }, []); // No dependencies - only run once on mount

  // Connect WebSocket - wait for terminal to be ready
  useEffect(() => {
    if (!isTerminalReady || !sessionId) return;
    const terminal = xtermRef.current;
    if (!terminal) return;

    const connect = () => {
      // Build WebSocket URL with token
      let url = `${wsUrl}/api/terminal/ws?sessionId=${sessionId}`;
      if (authToken) {
        url += `&token=${encodeURIComponent(authToken)}`;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[Terminal] WebSocket connected for session ${sessionId}`);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "data":
              terminal.write(msg.data);
              break;
            case "scrollback":
              // Only process scrollback if there's actual data
              // Don't clear if empty - prevents blank terminal issue
              if (msg.data && msg.data.length > 0) {
                // Use reset() which is more reliable than clear() or escape sequences
                terminal.reset();
                terminal.write(msg.data);
              }
              break;
            case "connected":
              console.log(`[Terminal] Session connected: ${msg.shell} in ${msg.cwd}`);
              if (msg.shell) {
                // Extract shell name from path (e.g., "/bin/bash" -> "bash")
                const name = msg.shell.split("/").pop() || msg.shell;
                setShellName(name);
              }
              break;
            case "exit":
              terminal.write(`\r\n\x1b[33m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`);
              break;
            case "pong":
              // Heartbeat response
              break;
          }
        } catch (err) {
          console.error("[Terminal] Message parse error:", err);
        }
      };

      ws.onclose = (event) => {
        console.log(`[Terminal] WebSocket closed for session ${sessionId}:`, event.code, event.reason);
        wsRef.current = null;

        // Don't reconnect if closed normally or auth failed
        if (event.code === 1000 || event.code === 4001 || event.code === 4003) {
          return;
        }

        // Attempt reconnect after a delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (xtermRef.current) {
            console.log(`[Terminal] Attempting reconnect for session ${sessionId}`);
            connect();
          }
        }, 2000);
      };

      ws.onerror = (error) => {
        console.error(`[Terminal] WebSocket error for session ${sessionId}:`, error);
      };
    };

    connect();

    // Handle terminal input
    const dataHandler = terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Cleanup
    return () => {
      dataHandler.dispose();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, authToken, wsUrl, isTerminalReady]);

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    // Clear any pending resize
    if (resizeDebounceRef.current) {
      clearTimeout(resizeDebounceRef.current);
    }

    // Debounce resize operations to prevent race conditions
    resizeDebounceRef.current = setTimeout(() => {
      if (!fitAddonRef.current || !xtermRef.current || !terminalRef.current) return;

      const container = terminalRef.current;
      const rect = container.getBoundingClientRect();

      // Only skip if container has no size at all
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      try {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;

        // Send resize to server
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch (err) {
        console.error("[Terminal] Resize error:", err);
      }
    }, RESIZE_DEBOUNCE_MS);
  }, []);

  // Resize observer
  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(container);

    // Also handle window resize
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize]);

  // Focus terminal when becoming active or when terminal becomes ready
  useEffect(() => {
    if (isActive && isTerminalReady && xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [isActive, isTerminalReady]);

  // Update terminal font size when it changes
  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      xtermRef.current.options.fontSize = fontSize;
      // Refit after font size change
      if (fitAddonRef.current && terminalRef.current) {
        const rect = terminalRef.current.getBoundingClientRect();
        // Only fit if container has any size
        if (rect.width > 0 && rect.height > 0) {
          fitAddonRef.current.fit();
          // Notify server of new dimensions
          const { cols, rows } = xtermRef.current;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
          }
        }
      }
    }
  }, [fontSize, isTerminalReady]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (xtermRef.current && isTerminalReady) {
      const terminalTheme = getTerminalTheme(effectiveTheme);
      xtermRef.current.options.theme = terminalTheme;
    }
  }, [effectiveTheme, isTerminalReady]);

  // Handle keyboard shortcuts for zoom (Ctrl+Plus, Ctrl+Minus, Ctrl+0)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if Ctrl (or Cmd on Mac) is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      // Ctrl/Cmd + Plus or Ctrl/Cmd + = (for keyboards without numpad)
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        e.stopPropagation();
        zoomIn();
        return;
      }

      // Ctrl/Cmd + Minus
      if (e.key === "-") {
        e.preventDefault();
        e.stopPropagation();
        zoomOut();
        return;
      }

      // Ctrl/Cmd + 0 to reset
      if (e.key === "0") {
        e.preventDefault();
        e.stopPropagation();
        resetZoom();
        return;
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  // Handle mouse wheel zoom (Ctrl+Wheel)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom if Ctrl (or Cmd on Mac) is pressed
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY < 0) {
        // Scroll up = zoom in
        zoomIn();
      } else if (e.deltaY > 0) {
        // Scroll down = zoom out
        zoomOut();
      }
    };

    // Use passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomIn, zoomOut]);

  // Context menu actions for keyboard navigation
  const menuActions = ["copy", "paste", "selectAll", "clear"] as const;

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    focusedMenuIndexRef.current = focusedMenuIndex;
  }, [focusedMenuIndex]);

  // Close context menu on click outside or scroll, handle keyboard navigation
  useEffect(() => {
    if (!contextMenu) return;

    // Reset focus index and focus menu when opened
    setFocusedMenuIndex(0);
    focusedMenuIndexRef.current = 0;
    requestAnimationFrame(() => {
      const firstButton = contextMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstButton?.focus();
    });

    const handleClick = () => closeContextMenu();
    const handleScroll = () => closeContextMenu();
    const handleKeyDown = (e: KeyboardEvent) => {
      const updateFocusIndex = (newIndex: number) => {
        focusedMenuIndexRef.current = newIndex;
        setFocusedMenuIndex(newIndex);
      };

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeContextMenu();
          break;
        case "ArrowDown":
          e.preventDefault();
          updateFocusIndex((focusedMenuIndexRef.current + 1) % menuActions.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          updateFocusIndex((focusedMenuIndexRef.current - 1 + menuActions.length) % menuActions.length);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          handleContextMenuAction(menuActions[focusedMenuIndexRef.current]);
          break;
        case "Tab":
          e.preventDefault();
          closeContextMenu();
          break;
      }
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu, closeContextMenu, handleContextMenuAction]);

  // Focus the correct menu item when navigation changes
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const buttons = contextMenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    buttons[focusedMenuIndex]?.focus();
  }, [focusedMenuIndex, contextMenu]);

  // Handle right-click context menu with boundary checking
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Menu dimensions (approximate)
    const menuWidth = 160;
    const menuHeight = 152; // 4 items + separator + padding
    const padding = 8;

    // Calculate position with boundary checks
    let x = e.clientX;
    let y = e.clientY;

    // Check right edge
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Check bottom edge
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure not negative
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setContextMenu({ x, y });
  }, []);

  // Combine refs for the container
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setDropRef(node);
  }, [setDropRef]);

  // Get current terminal theme for xterm styling
  const currentTerminalTheme = getTerminalTheme(effectiveTheme);

  return (
    <div
      ref={setRefs}
      className={cn(
        "flex flex-col h-full relative",
        isActive && "ring-1 ring-brand-500 ring-inset",
        // Visual feedback when dragging this terminal
        isDragging && "opacity-50",
        // Visual feedback when hovering over as drop target
        isOver && isDropTarget && "ring-2 ring-green-500 ring-inset"
      )}
      onClick={onFocus}
      tabIndex={0}
      data-terminal-container="true"
    >
      {/* Drop indicator overlay */}
      {isOver && isDropTarget && (
        <div className="absolute inset-0 bg-green-500/10 z-10 pointer-events-none flex items-center justify-center">
          <div className="px-3 py-2 bg-green-500/90 rounded-md text-white text-sm font-medium">
            Drop to swap
          </div>
        </div>
      )}

      {/* Header bar with drag handle - uses app theme CSS variables */}
      <div className="flex items-center h-7 px-1 shrink-0 bg-card border-b border-border">
        {/* Drag handle */}
        <button
          ref={setDragRef}
          {...dragAttributes}
          {...dragListeners}
          className={cn(
            "p-1 rounded cursor-grab active:cursor-grabbing mr-1 transition-colors text-muted-foreground hover:text-foreground hover:bg-accent",
            isDragging && "cursor-grabbing"
          )}
          title="Drag to swap terminals"
        >
          <GripHorizontal className="h-3 w-3" />
        </button>

        {/* Terminal icon and label */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs truncate text-foreground">
            {shellName}
          </span>
          {/* Font size indicator - only show when not default */}
          {fontSize !== DEFAULT_FONT_SIZE && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetZoom();
              }}
              className="text-[10px] px-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Click to reset zoom (Ctrl+0)"
            >
              {fontSize}px
            </button>
          )}
        </div>

        {/* Zoom and action buttons */}
        <div className="flex items-center gap-0.5">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              zoomOut();
            }}
            title="Zoom Out (Ctrl+-)"
            disabled={fontSize <= MIN_FONT_SIZE}
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              zoomIn();
            }}
            title="Zoom In (Ctrl++)"
            disabled={fontSize >= MAX_FONT_SIZE}
          >
            <ZoomIn className="h-3 w-3" />
          </Button>

          <div className="w-px h-3 mx-0.5 bg-border" />

          {/* Split/close buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSplitHorizontal();
            }}
            title="Split Right (Cmd+D)"
          >
            <SplitSquareHorizontal className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSplitVertical();
            }}
            title="Split Down (Cmd+Shift+D)"
          >
            <SplitSquareVertical className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close Terminal (Cmd+W)"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal container - uses terminal theme */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-hidden"
        style={{ backgroundColor: currentTerminalTheme.background }}
        onContextMenu={handleContextMenu}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Terminal context menu"
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 0 ? 0 : -1}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none",
              focusedMenuIndex === 0 ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => handleContextMenuAction("copy")}
          >
            <Copy className="h-4 w-4" />
            <span className="flex-1 text-left">Copy</span>
            <span className="text-xs text-muted-foreground">{isMac ? "⌘C" : "Ctrl+C"}</span>
          </button>
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 1 ? 0 : -1}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none",
              focusedMenuIndex === 1 ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => handleContextMenuAction("paste")}
          >
            <ClipboardPaste className="h-4 w-4" />
            <span className="flex-1 text-left">Paste</span>
            <span className="text-xs text-muted-foreground">{isMac ? "⌘V" : "Ctrl+V"}</span>
          </button>
          <div role="separator" className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 2 ? 0 : -1}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none",
              focusedMenuIndex === 2 ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => handleContextMenuAction("selectAll")}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="flex-1 text-left">Select All</span>
            <span className="text-xs text-muted-foreground">{isMac ? "⌘A" : "Ctrl+A"}</span>
          </button>
          <button
            role="menuitem"
            tabIndex={focusedMenuIndex === 3 ? 0 : -1}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground cursor-default outline-none",
              focusedMenuIndex === 3 ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => handleContextMenuAction("clear")}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1 text-left">Clear</span>
          </button>
        </div>
      )}
    </div>
  );
}
