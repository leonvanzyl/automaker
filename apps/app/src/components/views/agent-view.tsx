"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAppStore, type AgentModel } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageDropZone } from "@/components/ui/image-drop-zone";
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  Wrench,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Paperclip,
  X,
  ImageIcon,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useElectronAgent } from "@/hooks/use-electron-agent";
import { SessionManager } from "@/components/session-manager";
import { Markdown } from "@/components/ui/markdown";
import type { ImageAttachment } from "@/store/app-store";
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CLAUDE_MODELS } from "@/components/views/board-view/shared/model-constants";

export function AgentView() {
  const { currentProject, setLastSelectedSession, getLastSelectedSession } =
    useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();
  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<ImageAttachment[]>([]);
  const [showImageDropZone, setShowImageDropZone] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSessionManager, setShowSessionManager] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AgentModel>("sonnet");

  // Track if initial session has been loaded
  const initialSessionLoadedRef = useRef(false);

  // Scroll management for auto-scroll
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  // Input ref for auto-focus
  const inputRef = useRef<HTMLInputElement>(null);

  // Ref for quick create session function from SessionManager
  const quickCreateSessionRef = useRef<(() => Promise<void>) | null>(null);

  // Use the Electron agent hook (only if we have a session)
  const {
    messages,
    isProcessing,
    isConnected,
    sendMessage,
    clearHistory,
    error: agentError,
  } = useElectronAgent({
    sessionId: currentSessionId || "",
    workingDirectory: currentProject?.path,
    model: selectedModel,
    onToolUse: (toolName) => {
      setCurrentTool(toolName);
      setTimeout(() => setCurrentTool(null), 2000);
    },
  });

  // Handle session selection with persistence
  const handleSelectSession = useCallback(
    (sessionId: string | null) => {
      setCurrentSessionId(sessionId);
      // Persist the selection for this project
      if (currentProject?.path) {
        setLastSelectedSession(currentProject.path, sessionId);
      }
    },
    [currentProject?.path, setLastSelectedSession]
  );

  // Restore last selected session when switching to Agent view or when project changes
  useEffect(() => {
    if (!currentProject?.path) {
      // No project, reset
      setCurrentSessionId(null);
      initialSessionLoadedRef.current = false;
      return;
    }

    // Only restore once per project
    if (initialSessionLoadedRef.current) return;
    initialSessionLoadedRef.current = true;

    const lastSessionId = getLastSelectedSession(currentProject.path);
    if (lastSessionId) {
      console.log(
        "[AgentView] Restoring last selected session:",
        lastSessionId
      );
      setCurrentSessionId(lastSessionId);
    }
  }, [currentProject?.path, getLastSelectedSession]);

  // Reset initialSessionLoadedRef when project changes
  useEffect(() => {
    initialSessionLoadedRef.current = false;
  }, [currentProject?.path]);

  const handleSend = useCallback(async () => {
    if ((!input.trim() && selectedImages.length === 0) || isProcessing) return;

    const messageContent = input;
    const messageImages = selectedImages;

    setInput("");
    setSelectedImages([]);
    setShowImageDropZone(false);

    await sendMessage(messageContent, messageImages);
  }, [input, selectedImages, isProcessing, sendMessage]);

  const handleImagesSelected = useCallback((images: ImageAttachment[]) => {
    setSelectedImages(images);
  }, []);

  const toggleImageDropZone = useCallback(() => {
    setShowImageDropZone(!showImageDropZone);
  }, [showImageDropZone]);

  // Helper function to convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file as base64"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }, []);

  // Process dropped files
  const processDroppedFiles = useCallback(
    async (files: FileList) => {
      if (isProcessing) return;

      const ACCEPTED_IMAGE_TYPES = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const MAX_FILES = 5;

      const newImages: ImageAttachment[] = [];
      const errors: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file type
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          errors.push(
            `${file.name}: Unsupported file type. Please use JPG, PNG, GIF, or WebP.`
          );
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
          errors.push(
            `${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`
          );
          continue;
        }

        // Check if we've reached max files
        if (newImages.length + selectedImages.length >= MAX_FILES) {
          errors.push(`Maximum ${MAX_FILES} images allowed.`);
          break;
        }

        try {
          const base64 = await fileToBase64(file);
          const imageAttachment: ImageAttachment = {
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            data: base64,
            mimeType: file.type,
            filename: file.name,
            size: file.size,
          };
          newImages.push(imageAttachment);
        } catch (error) {
          errors.push(`${file.name}: Failed to process image.`);
        }
      }

      if (errors.length > 0) {
        console.warn("Image upload errors:", errors);
      }

      if (newImages.length > 0) {
        setSelectedImages((prev) => [...prev, ...newImages]);
      }
    },
    [isProcessing, selectedImages, fileToBase64]
  );

  // Remove individual image
  const removeImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  // Drag and drop handlers for the input area
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing || !isConnected) return;

      // Check if dragged items contain files
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [isProcessing, isConnected]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only set dragOver to false if we're leaving the input container
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isProcessing || !isConnected) return;

      // Check if we have files
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processDroppedFiles(files);
        return;
      }

      // Handle file paths (from screenshots or other sources)
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              processDroppedFiles(dataTransfer.files);
            }
          }
        }
      }
    },
    [isProcessing, isConnected, processDroppedFiles]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      // Check if clipboard contains files
      const items = e.clipboardData?.items;
      if (items) {
        const files: File[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file && file.type.startsWith("image/")) {
              e.preventDefault(); // Prevent default paste of file path
              files.push(file);
            }
          }
        }

        if (files.length > 0) {
          const dataTransfer = new DataTransfer();
          files.forEach((file) => dataTransfer.items.add(file));
          await processDroppedFiles(dataTransfer.files);
        }
      }
    },
    [processDroppedFiles]
  );

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = async () => {
    if (!confirm("Are you sure you want to clear this conversation?")) return;
    await clearHistory();
  };

  // Scroll position detection
  const checkIfUserIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const threshold = 50; // 50px threshold for "near bottom"
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold;

    setIsUserAtBottom(isAtBottom);
  }, []);

  // Scroll to bottom function
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: behavior,
    });
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    checkIfUserIsAtBottom();
  }, [checkIfUserIsAtBottom]);

  // Auto-scroll effect when messages change
  useEffect(() => {
    // Only auto-scroll if user was already at bottom
    if (isUserAtBottom && messages.length > 0) {
      // Use a small delay to ensure DOM is updated
      setTimeout(() => {
        scrollToBottom("smooth");
      }, 100);
    }
  }, [messages, isUserAtBottom, scrollToBottom]);

  // Initial scroll to bottom when session changes
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      // Scroll immediately without animation when switching sessions
      setTimeout(() => {
        scrollToBottom("auto");
        setIsUserAtBottom(true);
      }, 100);
    }
  }, [currentSessionId, scrollToBottom]);

  // Auto-focus input when session is selected/changed
  useEffect(() => {
    if (currentSessionId && inputRef.current) {
      // Small delay to ensure UI has updated
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  }, [currentSessionId]);

  // Keyboard shortcuts for agent view
  const agentShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // New session shortcut - only when in agent view with a project
    if (currentProject) {
      shortcutsList.push({
        key: shortcuts.newSession,
        action: () => {
          if (quickCreateSessionRef.current) {
            quickCreateSessionRef.current();
          }
        },
        description: "Create new session",
      });
    }

    return shortcutsList;
  }, [currentProject, shortcuts]);

  // Register keyboard shortcuts
  useKeyboardShortcuts(agentShortcuts);

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center bg-background"
        data-testid="agent-view-no-project"
      >
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-3 text-foreground">
            No Project Selected
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Open or create a project to start working with the AI agent.
          </p>
        </div>
      </div>
    );
  }

  // Show welcome message if no messages yet
  const displayMessages =
    messages.length === 0
      ? [
          {
            id: "welcome",
            role: "assistant" as const,
            content:
              "Hello! I'm the Automaker Agent. I can help you build software autonomously. I can read and modify files in this project, run commands, and execute tests. What would you like to create today?",
            timestamp: new Date().toISOString(),
          },
        ]
      : messages;

  return (
    <div
      className="flex-1 flex overflow-hidden bg-background"
      data-testid="agent-view"
    >
      {/* Session Manager Sidebar */}
      {showSessionManager && currentProject && (
        <div className="w-80 border-r border-border flex-shrink-0 bg-card/50">
          <SessionManager
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            projectPath={currentProject.path}
            isCurrentSessionThinking={isProcessing}
            onQuickCreateRef={quickCreateSessionRef}
          />
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSessionManager(!showSessionManager)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              {showSessionManager ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeft className="w-4 h-4" />
              )}
            </Button>
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                AI Agent
              </h1>
              <p className="text-sm text-muted-foreground">
                {currentProject.name}
                {currentSessionId && !isConnected && " - Connecting..."}
              </p>
            </div>
          </div>

          {/* Status indicators & actions */}
          <div className="flex items-center gap-3">
            {/* Model Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-medium"
                  disabled={isProcessing}
                  data-testid="model-selector"
                >
                  <Bot className="w-3.5 h-3.5" />
                  {CLAUDE_MODELS.find((m) => m.id === selectedModel)?.label.replace("Claude ", "") || "Sonnet"}
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {CLAUDE_MODELS.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      "cursor-pointer",
                      selectedModel === model.id && "bg-accent"
                    )}
                    data-testid={`model-option-${model.id}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{model.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {model.description}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {currentTool && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border">
                <Wrench className="w-3 h-3 text-primary" />
                <span className="font-medium">{currentTool}</span>
              </div>
            )}
            {agentError && (
              <span className="text-xs text-destructive font-medium">
                {agentError}
              </span>
            )}
            {currentSessionId && messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearChat}
                disabled={isProcessing}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        {!currentSessionId ? (
          <div
            className="flex-1 flex items-center justify-center bg-background"
            data-testid="no-session-placeholder"
          >
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <Bot className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold mb-3 text-foreground">
                No Session Selected
              </h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Create or select a session to start chatting with the AI agent
              </p>
              <Button
                onClick={() => setShowSessionManager(true)}
                variant="outline"
                className="gap-2"
              >
                <PanelLeft className="w-4 h-4" />
                {showSessionManager ? "View" : "Show"} Sessions
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth"
            data-testid="message-list"
            onScroll={handleScroll}
          >
            {displayMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4 max-w-4xl",
                  message.role === "user" ? "flex-row-reverse ml-auto" : ""
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                    message.role === "assistant"
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "bg-muted ring-1 ring-border"
                  )}
                >
                  {message.role === "assistant" ? (
                    <Bot className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={cn(
                    "flex-1 max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  )}
                >
                  {message.role === "assistant" ? (
                    <Markdown className="text-sm text-foreground prose-p:leading-relaxed prose-headings:text-foreground prose-strong:text-foreground prose-code:text-primary prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
                      {message.content}
                    </Markdown>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  )}

                  {/* Display attached images for user messages */}
                  {message.role === "user" &&
                    message.images &&
                    message.images.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-primary-foreground/80">
                          <ImageIcon className="w-3 h-3" />
                          <span>
                            {message.images.length} image
                            {message.images.length > 1 ? "s" : ""} attached
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {message.images.map((image, index) => {
                            // Construct proper data URL from base64 data and mime type
                            const dataUrl = image.data.startsWith("data:")
                              ? image.data
                              : `data:${image.mimeType || "image/png"};base64,${
                                  image.data
                                }`;
                            return (
                              <div
                                key={image.id || `img-${index}`}
                                className="relative group rounded-lg overflow-hidden border border-primary-foreground/20 bg-primary-foreground/10"
                              >
                                <img
                                  src={dataUrl}
                                  alt={
                                    image.filename ||
                                    `Attached image ${index + 1}`
                                  }
                                  className="w-20 h-20 object-cover hover:opacity-90 transition-opacity"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5 text-[9px] text-white truncate">
                                  {image.filename || `Image ${index + 1}`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  <p
                    className={cn(
                      "text-[11px] mt-2 font-medium",
                      message.role === "user"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}

            {/* Thinking Indicator */}
            {isProcessing && (
              <div className="flex gap-4 max-w-4xl">
                <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-pulse"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-pulse"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-pulse"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input Area */}
        {currentSessionId && (
          <div className="border-t border-border p-4 bg-card/50 backdrop-blur-sm">
            {/* Image Drop Zone (when visible) */}
            {showImageDropZone && (
              <ImageDropZone
                onImagesSelected={handleImagesSelected}
                images={selectedImages}
                maxFiles={5}
                className="mb-4"
                disabled={isProcessing || !isConnected}
              />
            )}

            {/* Selected Images Preview */}
            {selectedImages.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">
                    {selectedImages.length} image
                    {selectedImages.length > 1 ? "s" : ""} attached
                  </p>
                  <button
                    onClick={() => setSelectedImages([])}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isProcessing}
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedImages.map((image) => (
                    <div
                      key={image.id}
                      className="group relative rounded-lg border border-border bg-muted/30 p-2 flex items-center gap-2 hover:border-primary/30 transition-colors"
                    >
                      {/* Image thumbnail */}
                      <div className="w-8 h-8 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={image.data}
                          alt={image.filename}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {/* Image info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate max-w-24">
                          {image.filename}
                        </p>
                        {image.size !== undefined && (
                          <p className="text-[10px] text-muted-foreground">
                            {formatFileSize(image.size)}
                          </p>
                        )}
                      </div>
                      {/* Remove button */}
                      {image.id && (
                        <button
                          onClick={() => removeImage(image.id!)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          disabled={isProcessing}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Text Input and Controls */}
            <div
              className={cn(
                "flex gap-2 transition-all duration-200 rounded-xl p-1",
                isDragOver && "bg-primary/5 ring-2 ring-primary/30"
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  placeholder={
                    isDragOver
                      ? "Drop your images here..."
                      : "Describe what you want to build..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  onPaste={handlePaste}
                  disabled={isProcessing || !isConnected}
                  data-testid="agent-input"
                  className={cn(
                    "h-11 bg-background border-border rounded-xl pl-4 pr-20 text-sm transition-all",
                    "focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                    selectedImages.length > 0 && "border-primary/30",
                    isDragOver && "border-primary bg-primary/5"
                  )}
                />
                {selectedImages.length > 0 && !isDragOver && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
                    {selectedImages.length} image
                    {selectedImages.length > 1 ? "s" : ""}
                  </div>
                )}
                {isDragOver && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-primary font-medium">
                    <Paperclip className="w-3 h-3" />
                    Drop here
                  </div>
                )}
              </div>

              {/* Image Attachment Button */}
              <Button
                variant="outline"
                size="icon"
                onClick={toggleImageDropZone}
                disabled={isProcessing || !isConnected}
                className={cn(
                  "h-11 w-11 rounded-xl border-border",
                  showImageDropZone &&
                    "bg-primary/10 text-primary border-primary/30",
                  selectedImages.length > 0 && "border-primary/30 text-primary"
                )}
                title="Attach images"
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={
                  (!input.trim() && selectedImages.length === 0) ||
                  isProcessing ||
                  !isConnected
                }
                className="h-11 px-4 rounded-xl"
                data-testid="send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {/* Keyboard hint */}
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">
                Enter
              </kbd>{" "}
              to send
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
