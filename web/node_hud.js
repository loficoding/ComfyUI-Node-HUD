import { app } from "../../scripts/app.js";

// 1. Inject CSS
const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = "extensions/ComfyUI-Node-HUD/css/hud_styles.css";
document.head.appendChild(link);

app.registerExtension({
    name: "Comfy.CleanLayoutDock",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // --- A. Toggle Menu Option ---
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(_, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
            options.push({
                content: "Toggle Stack Info",
                callback: () => { 
                    this.show_stack_info = !this.show_stack_info; 
                    // Force a redraw to update visibility immediately
                    app.graph.setDirtyCanvas(true, true); 
                }
            });
        };

        // --- B. The Main Loop (Replaces Draw) ---
        // We hook into onDrawForeground to handle Position updates
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            
            // 1. Cleanup: If toggled off or empty, remove the dock
            const stackList = getHiddenNodes(this, app.graph);
            const shouldShow = this.show_stack_info && stackList.length > 0;

            if (!shouldShow) {
                if (this.hudElement) {
                    this.hudElement.remove();
                    this.hudElement = null;
                }
                return;
            }

            // 2. Update the Dock (Position & Content)
            updateDock(this, stackList, app.graph);
        };
    }
});

// --- HELPER: Find Hidden Nodes ---
function getHiddenNodes(parent, graph) {
    const stackList = [];
    if (!graph || !graph._nodes) return stackList;
    
    const pLeft = parent.pos[0];
    const pRight = parent.pos[0] + parent.size[0];
    const pTop = parent.pos[1];
    const pBottom = parent.pos[1] + parent.size[1];

    for (const node of graph._nodes) {
        if (node.id === parent.id) continue;
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
        document.body.appendChild(node.hudElement);
        node.lastStackSignature = ""; // Init signature
    }
    const dock = node.hudElement;

    // 2. Content Update (Optimization: Only if stack changed)
    // We create a "signature" string of IDs (e.g., "12,15,22")
    const currentSignature = stackList.map(n => n.id).join(",");

    if (currentSignature !== node.lastStackSignature) {
        dock.innerHTML = ""; // Clear
        node.lastStackSignature = currentSignature; // Update signature

        // Build Chips
        for (const item of stackList) {
            const chip = document.createElement("div");
            chip.className = "hud-chip";

            // Determine Border Color based on Mode
            if (item.mode === 2) chip.style.borderColor = "#888888"; // Muted
            else if (item.mode === 4) chip.style.borderColor = "#cc66ff"; // Bypassed

            // --- GATHER DOT COLORS ---
            const leftDots = [];
            const rightDots = [];

            // Inputs
            if (item.inputs) {
                for (const input of item.inputs) {
                    if (input.link) {
                        const link = graph.links[input.link];
                        if (link) leftDots.push(getLinkColor(link));
                    }
                }
            }
            // Outputs
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
            // Fallback Red Dot
            if (leftDots.length === 0 && rightDots.length === 0) {
                leftDots.push("#ff4444");
            }

            // --- BUILD CHIP DOM ---
            // Left Dots
            leftDots.forEach(c => {
                const d = document.createElement("div");
                d.className = "hud-dot";
                d.style.backgroundColor = c;
                chip.appendChild(d);
            });

            // Text
            const span = document.createElement("span");
            let text = item.title || item.type;
            if (text.length > 20) text = text.substring(0, 18) + "..";
            span.innerText = text;
            chip.appendChild(span);

            // Right Dots
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
    // Map Graph Coordinates -> Screen Coordinates
    const canvas = app.canvas;
    const scale = canvas.ds.scale;
    const offset = canvas.ds.offset;

    // Calculate screen position
    // (node.pos is [x, y])
    const screenX = (node.pos[0] + offset[0]) * scale;
    // Position it at the bottom of the node
    const screenY = (node.pos[1] + node.size[1] + offset[1]) * scale;

    dock.style.position = "absolute";
    dock.style.left = screenX + "px";
    dock.style.top = screenY + "px";
    dock.style.width = (node.size[0] * scale) + "px"; 
    
    // Scale the UI to match the zoom level 
    // (Using transform-origin top-left ensures it scales from the corner)
    dock.style.transform = `scale(${scale})`;
    dock.style.transformOrigin = "top left";
    dock.style.zIndex = "1000"; // Ensure it's on top
}