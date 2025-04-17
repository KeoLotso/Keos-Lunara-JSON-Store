const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const submitUpload = document.getElementById("submitUpload");
const titleInput = document.getElementById("titleInput");
const authorInput = document.getElementById("authorInput");
const fileInput = document.getElementById("jsonUpload");
const debugText = document.getElementById("uploadDebug");
const display = document.getElementById("jsonDisplay");
const refreshBtn = document.getElementById("refreshBtn");
const toggleUploadBtn = document.getElementById("toggleUploadBtn");
const uploadForm = document.getElementById("uploadForm");

toggleUploadBtn.addEventListener("click", () => {
    uploadForm.style.display = uploadForm.style.display === "none" ? "block" : "none";
});

submitUpload.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const file = fileInput.files[0];

    if (!title || !author || !file) {
        debugText.textContent = "Upload Failed: All fields are required.";
        debugText.className = "upload-debug error";
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            const jsonString = JSON.stringify(jsonData, null, 2);
            const date = new Date().toISOString().split("T")[0];
            const filename = `${title}_${author}_${date}.txt`;

            const fileContent = `Title = "${title}"\nAuthor = "${author}"\nJSON = \n${jsonString}`;

            const { error } = await supabase.storage.from(BUCKET_NAME).upload(filename, fileContent, {
                contentType: "text/plain",
                upsert: true
            });

            if (error) {
                debugText.textContent = "Upload Failed: " + error.message;
                debugText.className = "upload-debug error";
            } else {
                debugText.textContent = "Upload Success!";
                debugText.className = "upload-debug success";
                titleInput.value = "";
                authorInput.value = "";
                fileInput.value = "";
                loadStore();
            }
        } catch (err) {
            debugText.textContent = "Upload Failed: Invalid JSON file.";
            debugText.className = "upload-debug error";
        }
    };

    reader.readAsText(file);
});

refreshBtn.addEventListener("click", loadStore);

function parseItemStructure(rawJson) {
    try {
        const jsonData = JSON.parse(rawJson);
        if (!jsonData.objects || !jsonData.objects.length) return null;
        
        const inventory = jsonData.objects.find(obj => obj.collection === "user_inventory");
        if (!inventory || !inventory.value) return null;
        
        const inventoryData = JSON.parse(inventory.value);
        if (!inventoryData.items || !inventoryData.items.length) return null;
        
        return inventoryData.items;
    } catch (e) {
        console.error("Error parsing JSON structure:", e);
        return null;
    }
}

function countDuplicateItems(items) {
    const itemCounts = {};
    items.forEach(item => {
        const itemId = item.itemID;
        itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
    });
    return itemCounts;
}

function generateItemStructureHTML(items) {
    let html = '<div class="item-structure"><div class="item-structure-title">ITEMS:</div>';
    
    for (const item of items) {
        const hue = item.colorHue || 0;
        const saturation = Math.max(0, Math.min(100, (item.colorSaturation || 0) + 100));
        const color = `hsl(${hue}, ${saturation}%, 50%)`;
        
        html += `<div class="item-entry">
                    <span class="item-name">| ${item.itemID.replace('item_', '')} (Size: ${item.scaleModifier || 'S'}, Color: <span class="color-square" style="background-color: ${color};"></span>)</span>
                 </div>`;
        
        if (item.children && item.children.length) {
            const childCounts = {};
            item.children.forEach(child => {
                const childId = child.itemID;
                childCounts[childId] = (childCounts[childId] || 0) + 1;
            });
            
            const displayedChildren = new Set();
            
            for (const childItem of item.children) {
                const childId = childItem.itemID;
                
                if (displayedChildren.has(childId)) continue;
                displayedChildren.add(childId);
                
                const childHue = childItem.colorHue || 0;
                const childSaturation = Math.max(0, Math.min(100, (childItem.colorSaturation || 0) + 100));
                const childColor = `hsl(${childHue}, ${childSaturation}%, 50%)`;
                
                const count = childCounts[childId];
                const countDisplay = count > 1 ? `, ${count} times` : '';
                
                html += `<div class="item-entry item-indent">
                           <span class="item-name">|→ ${childId.replace('item_', '')} (Size: ${childItem.scaleModifier || 'S'}${countDisplay}, Color: <span class="color-square" style="background-color: ${childColor};"></span>)</span>
                        </div>`;
            }
        }
    }
    
    html += '</div>';
    return html;
}

async function loadStore() {
    display.innerHTML = "<div class='loading'></div>";
    
    const { data: files, error } = await supabase.storage.from(BUCKET_NAME).list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
    });

    if (error) {
        display.innerHTML = "<p style='color:red;'>Failed to load files.</p>";
        return;
    }
    
    display.innerHTML = "";
    
    if (files.length === 0) {
        display.innerHTML = "<p style='text-align:center;color:var(--text-muted);'>No JSON files found. Upload one to get started!</p>";
        return;
    }

    for (const file of files) {
        const { data: fileData, error: downloadError } = await supabase
            .storage
            .from(BUCKET_NAME)
            .download(file.name);

        if (downloadError) continue;

        const text = await fileData.text();
        const titleMatch = text.match(/Title = "(.*)"/);
        const authorMatch = text.match(/Author = "(.*)"/);
        const jsonSplit = text.split("JSON = \n");
        const rawJson = jsonSplit.length > 1 ? jsonSplit[1] : null;

        if (!titleMatch || !authorMatch || !rawJson) continue;

        const title = titleMatch[1];
        const author = authorMatch[1];

        const container = document.createElement("div");
        container.className = "upload-entry";

        const items = parseItemStructure(rawJson);

        container.innerHTML = `
            <h2>${title}</h2>
            <p>Made by ${author}</p>
            ${items ? generateItemStructureHTML(items) : ''}
            <button>Download JSON</button>
        `;

        container.querySelector("button").addEventListener("click", () => {
            const blob = new Blob([rawJson], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        display.appendChild(container);
    }
}

window.addEventListener("DOMContentLoaded", loadStore);