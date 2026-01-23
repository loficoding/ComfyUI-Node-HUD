import { app } from "../../scripts/app.js";

// 1. Inject CSS
const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = "extensions/ComfyUI-Node-HUD/css/hud_styles.css";
document.head.appendChild(link);

app.registerExtension({
    name: "Comfy.NodeHUD",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // --- A. Toggle Menu Option ---
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(_, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
            options.push({
                content: "Toggle Stack Info",
                callback: () => { 
                    this.show_stack_info = !this.show_stack_info; 
                    
                    // Bring node to front of the array so it renders on top of everything
                    if (this.show_stack_info){
                        const nodes = app.graph._nodes;
                        const index = nodes.indexOf(this);
                        if (index > -1){
                            nodes.splice(index, 1);
                            nodes.push(this);
                        }
                    }
                    app.graph.setDirtyCanvas(true, true); 
                }
            });
        };

        // --- B. The Main Loop (Replaces Draw) ---
        // We hook into onDrawForeground to handle Position updates
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            
            // 1. Cleanup: If toggled off, empty, OR COLLAPSED, remove the dock
            const stackList = getHiddenNodes(this, app.graph);
            
            // ADDED: Check !this.flags.collapsed so HUD hides when node is collapsed
            const shouldShow = this.show_stack_info && stackList.length > 0 && !this.flags.collapsed;

            if (!shouldShow) {
                if (this.hudElement) {
                    this.hudElement.remove();
                    this.hudElement = null;
                }
                return;
            }

            // 2. Update the Dock (Position & Content)
            updateDock(this, stackList, app.graph);

            // If movement is laggy this ensures the HUD follows mouse during drag
            if(this.is_selected){
                app.graph.setDirtyCanvas(true, false);
            }
        };
    }
});

// --- HELPER: Find Hidden Nodes ---
function getHiddenNodes(parent, graph) {
    const stackList = [];
    if (!graph || !graph._nodes) return stackList;

    const parentIndex = graph._nodes.indexOf(parent);
    
    const pLeft = parent.pos[0];
    const pRight = parent.pos[0] + parent.size[0];
    const pTop = parent.pos[1];
    const pBottom = parent.pos[1] + parent.size[1];

    for (let i = 0; i < graph._nodes.length; i++) {
        const node = graph._nodes[i];

        if (node.id === parent.id) continue;
        
        // Only include nodes that are "below" the parent in the stack
        if (i > parentIndex) continue;

        const nx = node.pos[0];
        const ny = node.pos[1];

        // Check if center of node is inside parent (simple hit test)
        if (nx >= pLeft && nx < pRight && ny >= pTop && ny < pBottom) {
            stackList.push(node);
        }
    }
    return stackList;
}

// --- HELPER: Get Link Color ---
function getLinkColor(link) {
    if (!link) return "#aaaaff";
    const type = link.type;
    const colorMap = LGraphCanvas.link_type_colors;
    
    if (colorMap[type]) return colorMap[type];
    
    if (type === "STRING") return "#66ff66";   
    if (type === "INT") return "#22cc22";      
    if (type === "FLOAT") return "#22cc22";    
    if (type === "LATENT") return "#ff99aa";   
    if (type === "IMAGE") return "#66aaff";    
    if (type === "MODEL") return "#6666aa";    
    if (type === "VAE") return "#ff4444";      
    if (type === "CLIP") return "#ffff66";     
    if (type === "CONDITIONING") return "#aa6666"; 
    
    return "#aaaaff"; 
}

// --- THE NEW DOM BUILDER ---
function updateDock(node, stackList, graph) {
    // 1. Create Element if missing
    if (!node.hudElement) {
        node.hudElement = document.createElement("div");
        node.hudElement.className = "hud-dock";
        
        // Fix Zooming/Scrolling Issue:
        // Intercept wheel events to prevent browser page zoom, but manually trigger canvas zoom.
        node.hudElement.addEventListener("wheel", (e) => {
            // Stop the event from reaching the window (prevents whole page zoom/scroll)
            e.preventDefault();
            e.stopPropagation();

            // Manually apply zoom to the canvas so the user can still zoom the graph
            if (app.canvas && app.canvas.ds) {
                // Determine zoom direction and factor (standard LiteGraph logic)
                const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                app.canvas.ds.changeScale(app.canvas.ds.scale * zoomFactor, [e.clientX, e.clientY]);
                app.canvas.setDirty(true, true);
            }
        }, { passive: false });

        // We append to document.body to ensure getBoundingClientRect + scroll math works reliably
        document.body.appendChild(node.hudElement);
        
        node.lastStackSignature = ""; 
    }
    const dock = node.hudElement;

    // ... [Content Update Section remains exactly the same] ...
    const currentSignature = stackList.map(n => n.id).join(",");
    if (currentSignature !== node.lastStackSignature) {
        dock.innerHTML = ""; 
        node.lastStackSignature = currentSignature; 

        // Build Chips (Keep existing logic)
        for (const item of stackList) {
            const chip = document.createElement("div");
            chip.className = "hud-chip";

            if (item.mode === 2) chip.style.borderColor = "#888888"; 
            else if (item.mode === 4) chip.style.borderColor = "#cc66ff"; 

            const leftDots = [];
            const rightDots = [];

            if (item.inputs) {
                for (const input of item.inputs) {
                    if (input.link) {
                        const link = graph.links[input.link];
                        if (link) leftDots.push(getLinkColor(link));
                    }
                }
            }
            if (item.outputs) {
                for (const output of item.outputs) {
                    if (output.links && output.links.length > 0) {
                        const link = graph.links[output.links[0]];
                        if (link) rightDots.push(getLinkColor(link));
                        else if (LGraphCanvas.link_type_colors[output.type]) {
                            rightDots.push(LGraphCanvas.link_type_colors[output.type]);
                        } else {
                            if (output.type === "STRING") rightDots.push("#66ff66");
                            else rightDots.push("#cccccc"); 
                        }
                    }
                }
            }
            if (leftDots.length === 0 && rightDots.length === 0) {
                leftDots.push("#ff4444");
            }

            leftDots.forEach(c => {
                const d = document.createElement("div");
                d.className = "hud-dot";
                d.style.backgroundColor = c;
                chip.appendChild(d);
            });

            const span = document.createElement("span");
            let text = item.title || item.type;
            if (text.length > 20) text = text.substring(0, 18) + "..";
            span.innerText = text;
            chip.appendChild(span);

            rightDots.forEach(c => {
                const d = document.createElement("div");
                d.className = "hud-dot";
                d.style.backgroundColor = c;
                chip.appendChild(d);
            });

            dock.appendChild(chip);
        }
    }

    // 3. Position Update (Run every frame)
    const canvas = app.canvas;
    const scale = canvas.ds.scale;
    const offset = canvas.ds.offset;

    // Get the DOM position of the canvas element itself (fixes window offset issues)
    const canvasRect = canvas.canvas.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Graph Coordinates
    const graphX = node.pos[0];
    const graphY = node.pos[1] + node.size[1] + 2; 

    // --- CORRECTION: MATCH LITEGRAPH TRANSFORM ---
    const screenX = (graphX + offset[0]) * scale + canvasRect.left + scrollX;
    const screenY = (graphY + offset[1]) * scale + canvasRect.top + scrollY;

    // GEOMETRY ONLY
    dock.style.position = "absolute";
    dock.style.left = screenX + "px";
    dock.style.top = screenY + "px";
    dock.style.width = (node.size[0] * scale) + "px";
    dock.style.transform = "none"; 
    dock.style.margin = "0"; 

    // --- UPDATES: Zoom Class & Z-Index ---
    
    // 1. Zoom Logic (Around 57% zoom, text usually disappears)
    if (scale < 0.58) {
        dock.classList.add("hud-dock-zoomed-out");
    } else {
        dock.classList.remove("hud-dock-zoomed-out");
    }

    // 2. Z-Index Logic (Refined)
    // We base the z-index on the node's position in the graph stack (0, 1, 2...).
    // Standard UI widgets (like active text boxes) usually have high z-indices (1000+).
    // By keeping this low, we allow other DOM elements to sit on top if needed.
    let zIndex = graph._nodes.indexOf(node);
    
    // Safety check: Ensure we don't accidentally get -1 or weird values
    if (zIndex < 0) zIndex = 0;
    
    if (node.zIndex !== undefined) {
        zIndex = node.zIndex;
    } else if (node.style && node.style.zIndex) {
        zIndex = node.style.zIndex;
    }
    
    // Important: We assign this dynamically every frame to ensure it updates if node order changes
    dock.style.zIndex = zIndex;
}