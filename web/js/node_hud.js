import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.CleanLayoutDock",
    
    // 1. Toggle Menu
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(_, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
            options.push({
                content: "Toggle Stack Info",
                callback: () => { 
                    this.show_stack_info = !this.show_stack_info; 
                    app.graph.setDirtyCanvas(true, true); 
                }
            });
        };

        // 2. Draw Foreground
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            
            if (!this.show_stack_info) return;

            const stackList = getHiddenNodes(this, app.graph);
            if (stackList.length === 0) return;

            ctx.save();
            drawDock(this, ctx, stackList, app.graph);
            ctx.restore();
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
        if (nx >= pLeft && nx < pRight && ny >= pTop && ny < pBottom) {
            stackList.push(node);
        }
    }
    return stackList;
}

// --- HELPER: Get Link Color ---
function getLinkColor(link) {
    const type = link.type;
    const colorMap = LGraphCanvas.link_type_colors;
    
    // 1. Check Comfy Registry first
    if (colorMap[type]) return colorMap[type];
    
    // 2. Common Fallbacks
    if (type === "STRING") return "#66ff66";   // <--- FIXED: Standard Green
    if (type === "INT") return "#22cc22";      // Integer Green
    if (type === "FLOAT") return "#22cc22";    // Float Green
    if (type === "LATENT") return "#ff99aa";   
    if (type === "IMAGE") return "#66aaff";    
    if (type === "MODEL") return "#6666aa";    
    if (type === "VAE") return "#ff4444";      
    if (type === "CLIP") return "#ffff66";     
    if (type === "CONDITIONING") return "#aa6666"; 
    
    return "#aaaaff"; // The "Lint Blue" Default
}

// --- DRAWER ---
function drawDock(node, ctx, stackList, graph) {
    if (!node.size) return;
    
    const dockHeight = 26; 
    const chipHeight = 16;
    const padding = 6;     
    const dotRadius = 3;
    const dotSpacing = 8;
    
    const x = 0;
    const y = node.size[1]; 

    /*
    // Background
    ctx.fillStyle = "#000"; 
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, node.size[0], dockHeight, [0, 0, 6, 6]);
    else ctx.rect(x, y, node.size[0], dockHeight);
    ctx.fill();
    */

    // Background (Tinted Glass Style)
    ctx.fillStyle = "rgba(20, 20, 20, 0.85)"; // 85% Opaque Dark Grey
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, node.size[0], dockHeight, [0, 0, 6, 6]);
    else ctx.rect(x, y, node.size[0], dockHeight);
    ctx.fill();

    // Optional: Add a subtle glass border for definition
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
    ctx.lineWidth = 1;
    ctx.stroke();
    
    let currentX = x + padding;
    ctx.font = "10px Arial";
    ctx.textBaseline = "middle";

    for (const item of stackList) {
        // 1. Gather Dots
        const leftDots = [];
        const rightDots = [];

        // Check Inputs
        if (item.inputs) {
            for (const input of item.inputs) {
                if (input.link) {
                    const link = graph.links[input.link];
                    if (link) leftDots.push(getLinkColor(link));
                }
            }
        }

        // Check Outputs
        if (item.outputs) {
            for (const output of item.outputs) {
                if (output.links && output.links.length > 0) {
                    // Use color of first link
                    const link = graph.links[output.links[0]];
                    if (link) rightDots.push(getLinkColor(link));
                    else if (LGraphCanvas.link_type_colors[output.type]) {
                        rightDots.push(LGraphCanvas.link_type_colors[output.type]);
                    } else {
                        // Manual check for disconnected outputs that usually have colors
                        if (output.type === "STRING") rightDots.push("#66ff66");
                        else rightDots.push("#cccccc"); 
                    }
                }
            }
        }

        // Fallback: Disconnected
        if (leftDots.length === 0 && rightDots.length === 0) {
            leftDots.push("#ff4444"); // Red error dot
        }

        // 2. Calculate Size
        let text = item.title || item.type;
        if (text.length > 20) text = text.substring(0, 18) + "..";
        const textWidth = ctx.measureText(text).width;
        
        const leftSpace = 6 + (leftDots.length * dotSpacing);
        const rightSpace = 6 + (rightDots.length * dotSpacing);
        const chipWidth = leftSpace + textWidth + rightSpace;

        if (currentX + chipWidth > node.size[0]) break;

        // 3. Determine Border Color
        let borderColor = "#444"; 
        if (item.mode === 2) borderColor = "#888888"; // Mute
        else if (item.mode === 4) borderColor = "#cc66ff"; // Bypass

        const centerY = y + (dockHeight/2);

        // 4. Draw Chip
        ctx.fillStyle = "#222"; 
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(currentX, y + (dockHeight - chipHeight)/2, chipWidth, chipHeight, 8);
        else ctx.rect(currentX, y + (dockHeight - chipHeight)/2, chipWidth, chipHeight);
        ctx.fill();
        ctx.stroke();

        // 5. Draw Left Dots
        let dotX = currentX + 6;
        for (const color of leftDots) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(dotX + dotRadius, centerY, dotRadius, 0, Math.PI * 2);
            ctx.fill();
            dotX += dotSpacing;
        }

        // 6. Draw Text
        ctx.fillStyle = "#ccc";
        ctx.fillText(text, currentX + leftSpace, centerY);

        // 7. Draw Right Dots
        dotX = currentX + leftSpace + textWidth + 6;
        for (const color of rightDots) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(dotX + dotRadius, centerY, dotRadius, 0, Math.PI * 2);
            ctx.fill();
            dotX += dotSpacing;
        }

        currentX += chipWidth + padding;
    }
}