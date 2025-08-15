(function() {
  "use strict";

  // DOM refs
  const gutterEl = document.getElementById("gutter");
  const bufferEl = document.getElementById("buffer");
  const tablineEl = document.getElementById("tabline");
  const statuslineEl = document.getElementById("statusline");

  // Theme/util
  const MIN_VISIBLE_LINES = 24;

  // File tree model
  const tree = {
    name: "~",
    type: "dir",
    children: [
      {
        name: "about.txt",
        type: "file",
        filetype: "txt",
        content: aboutContent()
      },
      {
        name: "projects",
        type: "dir",
        children: [
          {
            name: "01-terminal-portfolio.md",
            type: "file",
            filetype: "md",
            content: projectsContent()
          },
          {
            name: "02-cool-algorithms.md",
            type: "file",
            filetype: "md",
            content: "# Cool Algorithms\n\n- Implemented A* pathfinding visualizer\n- Wrote a constraint solver demo in the browser\n- Built a wasm-powered image filter playground\n"
          }
        ]
      },
      {
        name: "contact.txt",
        type: "file",
        filetype: "txt",
        content: contactContent()
      },
      {
        name: "resume.pdf",
        type: "file",
        filetype: "pdf",
        link: "#" // Resume here
      },
      {
        name: ".config",
        type: "dir",
        children: [
          {
            name: "nvim",
            type: "dir",
            children: [
              {
                name: "init.lua",
                type: "file",
                filetype: "lua",
                content: initLuaContent()
              }
            ]
          }
        ]
      }
    ]
  };

  // State
  let cwd = tree; // current directory node
  let pathStack = []; // stack of directories from root to cwd (excluding cwd)
  let selectionIndex = 0; // highlighted line in netrw
  let mode = "netrw"; // "netrw" | "buffer"
  let openFile = null; // currently opened file node
  let pendingG = false; // for gg
  let gTimer = null;

  // Helpers to build content
  function aboutContent() {
    return (
      "# About Me\n" +
      "\n" +
      "Hello. I build delightful, pragmatic software with a focus on DX, performance, and clean design.\n" +
      "\n" +
      "- Languages: TypeScript, Rust, Python\n" +
      "- Frameworks: React, Svelte, Solid, Node\n" +
      "- Tools: Neovim, tmux, zsh, Linux\n" +
      "\n" +
      "I love creating tactile, terminal-inspired UIs (like this one), exploring compilers, and shipping tiny utilities.\n"
    );
  }

  function projectsContent() {
    return (
      "# Terminal-Style Portfolio\n" +
      "\n" +
      "This project emulates a Neovim workspace in the browser with a Rosé Pine theme.\n" +
      "Navigate with j/k, open with Enter, go up with h, and quit buffers with q.\n" +
      "\n" +
      "Highlights:\n" +
      "- Netrw-like directory landing\n" +
      "- Keyboard-driven navigation\n" +
      "- Faux statusline and tabline\n" +
      "- Lightweight, no frameworks\n"
    );
  }

  function contactContent() {
    return (
      "# Contact\n" +
      "\n" +
      "- Email: alfonsobanzon@gmail.com\n" +
      "- GitHub: https://github.com/thefonzie-codes\n" +
      "- LinkedIn: https://linkedin.com/alfonso-banzon\n"
    );
  }

  function initLuaContent() {
    return [
      "-- ~/.config/nvim/init.lua",
      "-- Minimal Rosé Pine setup (mock)",
      "vim.opt.termguicolors = true",
      "vim.opt.number = true",
      "vim.opt.relativenumber = true",
      "vim.cmd('colorscheme rose-pine')",
      "",
      "-- Keymaps",
      "vim.keymap.set('n', '<leader>ff', function() print('Find files') end)",
      "vim.keymap.set('n', '<leader>gg', function() print('Git status') end)",
    ].join("\n");
  }

  // Render primitives
  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function computeVisibleLines() {
    const lineHeightPx = parseFloat(getComputedStyle(bufferEl).lineHeight) || 22;
    const available = bufferEl.clientHeight || (window.innerHeight - 28 - 28 - 16);
    const lines = Math.floor(available / lineHeightPx);
    return Math.max(lines, MIN_VISIBLE_LINES);
  }

  function renderLines(lines, cursorAtIndex) {
    clear(bufferEl);
    clear(gutterEl);

    const visible = computeVisibleLines();
    const tildeCount = Math.max(visible - lines.length, 0);

    for (let i = 0; i < lines.length; i++) {
      const ln = document.createElement("div");
      ln.className = "line" + (i === cursorAtIndex ? " cursorline" : "");
      ln.textContent = lines[i];
      bufferEl.appendChild(ln);

      const gn = document.createElement("div");
      gn.className = "line" + (i === cursorAtIndex ? " cursorline" : "");
      gn.textContent = String(i + 1).padStart(4, " ");
      gutterEl.appendChild(gn);
    }

    for (let i = 0; i < tildeCount; i++) {
      const ln = document.createElement("div");
      ln.className = "line tilde";
      ln.textContent = "~";
      bufferEl.appendChild(ln);

      const gn = document.createElement("div");
      gn.className = "line tilde";
      gn.textContent = "    ";
      gutterEl.appendChild(gn);
    }
  }

  // Tabline / Statusline
  function setTabline(label) {
    tablineEl.textContent = label;
  }

  function setStatus({ modeLabel, left, mid, right }) {
    clear(statuslineEl);

    const leftBox = document.createElement("div");
    leftBox.className = "status-left";

    const modeBox = document.createElement("span");
    modeBox.className = "status-mode";
    modeBox.textContent = modeLabel || "NORMAL";

    const leftText = document.createElement("span");
    leftText.textContent = left || "";

    leftBox.appendChild(modeBox);
    leftBox.appendChild(leftText);

    const midBox = document.createElement("div");
    midBox.className = "status-mid";
    midBox.textContent = mid || "";

    const rightBox = document.createElement("div");
    rightBox.className = "status-right";
    rightBox.textContent = right || "";

    statuslineEl.appendChild(leftBox);
    statuslineEl.appendChild(midBox);
    statuslineEl.appendChild(rightBox);
  }

  // Netrw rendering
  function sortedEntries(dirNode) {
    const entries = dirNode.children ? [...dirNode.children] : [];
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  function cwdPath() {
    const parts = [tree.name].concat(pathStack.map(n => n.name)).concat(cwd.name !== tree.name ? [cwd.name] : []);
    // Clean double tilde when at root
    if (parts[0] === "~" && parts[1] === "~") parts.shift();
    return parts.join("/").replace("~//", "~/");
  }

  function renderNetrw() {
    const entries = sortedEntries(cwd);
    const headerLines = [
      "" +
        "Netrw Directory Listing (press ? for help)",
      "Directory: " + cwdPath()
    ];

    const listing = ["../"].concat(
      entries.map(e => (e.type === "dir" ? e.name + "/" : e.name))
    );

    const lines = headerLines.concat([""], listing);

    const cursorIndex = headerLines.length + 1 + selectionIndex; // account for blank line
    renderLines(lines, cursorIndex);

    setTabline("[1] netrw  " + cwdPath());

    setStatus({
      modeLabel: "NORMAL",
      left: cwdPath(),
      mid: `${entries.filter(e => e.type === 'dir').length} dirs, ${entries.filter(e => e.type === 'file').length} files`,
      right: "utf-8[unix]  netrw"
    });

    // Mouse selection
    bufferEl.querySelectorAll(".line").forEach((ln, idx) => {
      ln.onclick = () => {
        // Map clicked idx back to selectionIndex
        const base = headerLines.length + 1; // blank line
        const sel = idx - base;
        if (sel >= 0 && sel < listing.length) {
          selectionIndex = sel;
          renderNetrw();
        }
      };
      ln.ondblclick = () => {
        openSelectedFromNetrw();
      };
    });
  }

  function openSelectedFromNetrw() {
    const entries = sortedEntries(cwd);
    const target = selectionIndex === 0 ? ".." : entries[selectionIndex - 1];

    if (target === "..") {
      goUpDir();
      return;
    }

    if (target.type === "dir") {
      pathStack.push(cwd);
      cwd = target;
      selectionIndex = 0;
      renderNetrw();
      return;
    }

    if (target.type === "file") {
      openBuffer(target);
      return;
    }
  }

  function goUpDir() {
    if (pathStack.length > 0) {
      cwd = pathStack.pop();
      selectionIndex = 0;
      renderNetrw();
    }
  }

  // Buffer view
  function openBuffer(fileNode) {
    mode = "buffer";
    openFile = fileNode;

    const header = `" ${fileNode.name}`;
    const content = (fileNode.content || (fileNode.link ? `Open link: ${fileNode.link}` : ""))
      .split("\n");

    const lines = [header, ""].concat(content);
    renderLines(lines, -1);

    setTabline(`[1] ${fileNode.name}`);

    const right = `${fileNode.filetype || "txt"}  ${content.length}L`; // lines
    setStatus({
      modeLabel: "NORMAL",
      left: fileNodePath(fileNode),
      mid: "",
      right
    });

    // If it's a link-like file (e.g., resume.pdf), click to open
    if (fileNode.link) {
      bufferEl.querySelectorAll(".line").forEach((ln, idx) => {
        if (idx === 2) {
          ln.innerHTML = `Open link: <a class="inline-link" href="${fileNode.link}" target="_blank" rel="noreferrer noopener">${fileNode.link}</a>`;
        }
      });
    }
  }

  function fileNodePath(n) {
    const parts = [];
    // Reconstruct by walking from root using pathStack + cwd
    const stack = [...pathStack, cwd];
    function findPath(node, target, acc) {
      if (node === target) return acc;
      if (node.children) {
        for (const ch of node.children) {
          const found = findPath(ch, target, acc.concat([node.name]));
          if (found) return found;
        }
      }
      return null;
    }
    const base = [tree.name];
    return base.concat(stack.map(n => n.name)).concat([n.name]).join("/").replace("~//", "~/");
  }

  function closeBuffer() {
    mode = "netrw";
    openFile = null;
    renderNetrw();
  }

  // Keyboard
  function handleKey(e) {
    if (mode === "netrw") return handleNetrwKey(e);
    if (mode === "buffer") return handleBufferKey(e);
  }

  function handleNetrwKey(e) {
    const entries = sortedEntries(cwd);
    const listingCount = 1 + entries.length; // ../ + entries

    if (e.key === "j" || e.key === "ArrowDown") {
      selectionIndex = (selectionIndex + 1) % listingCount;
      renderNetrw();
      e.preventDefault();
      return;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      selectionIndex = (selectionIndex - 1 + listingCount) % listingCount;
      renderNetrw();
      e.preventDefault();
      return;
    }
    if (e.key === "Enter" || e.key === "l" || e.key === "ArrowRight") {
      openSelectedFromNetrw();
      e.preventDefault();
      return;
    }
    if (e.key === "h" || e.key === "ArrowLeft") {
      goUpDir();
      e.preventDefault();
      return;
    }
    if (e.key === "g") {
      if (pendingG) {
        pendingG = false;
        clearTimeout(gTimer);
        selectionIndex = 0; // top (../)
        renderNetrw();
      } else {
        pendingG = true;
        gTimer = setTimeout(() => (pendingG = false), 500);
      }
      e.preventDefault();
      return;
    }
    if (e.key === "G") {
      selectionIndex = listingCount - 1;
      renderNetrw();
      e.preventDefault();
      return;
    }
    if (e.key === "?") {
      showHelp();
      e.preventDefault();
      return;
    }
  }

  function handleBufferKey(e) {
    if (e.key === "q") {
      closeBuffer();
      e.preventDefault();
      return;
    }
    if (e.key === "g") {
      if (pendingG) {
        pendingG = false;
        clearTimeout(gTimer);
        bufferEl.scrollTo({ top: 0, behavior: "instant" });
      } else {
        pendingG = true;
        gTimer = setTimeout(() => (pendingG = false), 500);
      }
      e.preventDefault();
      return;
    }
    if (e.key === "G") {
      bufferEl.scrollTo({ top: bufferEl.scrollHeight, behavior: "instant" });
      e.preventDefault();
      return;
    }
    if (e.key === "j" || e.key === "ArrowDown") {
      bufferEl.scrollBy({ top: 24, behavior: "instant" });
      e.preventDefault();
      return;
    }
    if (e.key === "k" || e.key === "ArrowUp") {
      bufferEl.scrollBy({ top: -24, behavior: "instant" });
      e.preventDefault();
      return;
    }
  }

  function showHelp() {
    const help = {
      name: "netrw-help.txt",
      type: "file",
      filetype: "txt",
      content: [
        "Netrw help",
        "",
        "j / k / ↓ / ↑   : move down / up",
        "h / l / ← / →   : go up dir / open",
        "Enter           : open",
        "gg / G          : top / bottom",
        "q               : close buffer",
        "?               : this help",
      ].join("\n")
    };
    openBuffer(help);
  }

  // Init
  function init() {
    bufferEl.focus();
    renderNetrw();
    window.addEventListener("resize", () => {
      if (mode === "netrw") renderNetrw(); else if (openFile) openBuffer(openFile);
    });
    window.addEventListener("keydown", handleKey);
  }

  init();
})(); 
