const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function gameCustomPrompt(message, isAmountField = false) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      display: flex; justify-content: center; align-items: center; z-index: 100000;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      background-color: #6f057a;
      box-shadow: inset 0 -0.365vw #61056b, 3px 3px 15px rgba(0,0,0,0.6);
      padding: 25px; border-radius: 12px; text-align: center;
      min-width: 320px; color: white; font-family: 'Pixelify Sans', sans-serif;
      font-size: 18px; display: flex; flex-direction: column; gap: 15px;
    `;

    const titleText = document.createElement("div");
    titleText.innerText = message;
    titleText.style.whiteSpace = "pre-line";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = isAmountField ? "e.g., 5 or * for max" : "e.g., Space Pack";
    input.style.cssText = `
      padding: 10px; border-radius: 6px; border: 2px solid rgba(255,255,255,0.2);
      outline: none; text-align: center; font-family: inherit; font-size: 16px;
      background: rgba(0,0,0,0.2); color: white;
    `;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display: flex; gap: 10px; justify-content: center; margin-top: 5px;`;

    const okBtn = document.createElement("button");
    okBtn.innerText = "Confirm";
    okBtn.style.cssText = `padding: 8px 20px; background: #4bc22e; color: white; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold;`;

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.cssText = `padding: 8px 20px; background: #be0000; color: white; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold;`;

    btnRow.append(okBtn, cancelBtn);
    box.append(titleText, input, btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    input.focus();

    input.onkeydown = (e) => {
      if (e.key === "Enter") okBtn.click();
      if (e.key === "Escape") cancelBtn.click();
    };

    okBtn.onclick = () => { resolve(input.value.trim() || null); overlay.remove(); };
    cancelBtn.onclick = () => { resolve(null); overlay.remove(); };
  });
}

async function bulkPromptAndOpenPack() {
  const defaultPackName = window.__selectedPack?.name || "";
  const packInput = await gameCustomPrompt(
    `What pack do you want to open?\n(OG, Color, Fall, Halloween, Christmas, Space, Technology, School)`,
    false
  );

  const finalPackQuery = packInput || defaultPackName;
  if (!finalPackQuery) return;

  try {
    const res = await fetch("/api/packs");
    if (!res.ok) throw new Error("Failed to load available packs from server.");
    const packs = await res.json();
    
    const targetPack = packs.find(
      (p) => p.name.toLowerCase().trim() === finalPackQuery.toLowerCase().trim()
    );

    if (!targetPack) {
      console.error(`❌ Pack "${finalPackQuery}" could not be found.`);
      return;
    }

    const currentTokens = window.userTokens || 0;
    const maxAffordable = Math.floor(currentTokens / targetPack.cost);
    if (maxAffordable <= 0) {
      console.warn(`⚠️ Insufficient tokens! You only have ${currentTokens}. ${targetPack.name} costs ${targetPack.cost}.`);
      return;
    }

    const countInput = await gameCustomPrompt(
      `How many "${targetPack.name}" packs?\nMax affordable: ${maxAffordable}\n\n(Type '*' for max)`,
      true
    );

    if (!countInput) return;

    let amountToOpen = 0;
    if (countInput === "*") {
      amountToOpen = maxAffordable;
    } else {
      amountToOpen = parseInt(countInput, 10);
      if (isNaN(amountToOpen) || amountToOpen <= 0) {
        console.error("❌ Invalid quantity typed.");
        return;
      }
      if (amountToOpen > maxAffordable) {
        amountToOpen = maxAffordable;
      }
    }

    console.clear();
    console.log(`🚀 Starting open process for ${amountToOpen}x ${targetPack.name}...`);
    
    const summary = {};
    let totalSpent = 0;
    let successfulOpens = 0;
    let consecutive429s = 0;

    for (let i = 0; i < amountToOpen; i++) {
      if (window.userTokens < targetPack.cost) break;

      const openRes = await fetch(`/api/packs/open/${encodeURIComponent(targetPack.name)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Accept": "application/json" },
      });

      if (openRes.status === 429) {
        consecutive429s++;
        if (consecutive429s > 3) {
          console.error("❌ Server is strictly blocking requests. Halting loop.");
          break;
        }
        console.warn(`⚠️ Hit a 429 Rate Limit. Cooling down for 5 seconds...`);
        await delay(5000);
        i--; 
        continue;
      }

      if (!openRes.ok) {
        console.error(`❌ Stopped on pack #${i + 1}. Server Status: ${openRes.status}`);
        break;
      }

      consecutive429s = 0;

      const data = await openRes.json();
      window.userTokens = data.tokens;
      totalSpent += targetPack.cost;
      successfulOpens++;

      const blookName = data.blook.blookName;
      const rarity = data.blook.rarity || "Common";

      if (!summary[blookName]) {
        summary[blookName] = { count: 0, rarity: rarity };
      }
      summary[blookName].count++;

      console.log(`[${successfulOpens}/${amountToOpen}] Got: ${blookName} (${rarity})`);

      if (typeof window.updateTokens === "function") window.updateTokens();
      if (typeof window.showResult === "function") {
        window.showResult(data.blook, {
          packBackground: targetPack.packBackground || window.__selectedPack?.packBackground,
          phase: "reveal",
          revealDelayMs: 0
        });
      }

      await delay(1200); 
    }

    console.log("\n=========================================");
    console.log(
      `%cLIQUIDATION CLEARING REPORT`, 
      "background: #6f057a; color: white; font-weight: bold; font-size: 13px; padding: 4px 8px; border-radius: 4px;"
    );
    console.log(`Packs Opened:     ${successfulOpens} / ${amountToOpen}`);
    console.log(`Tokens Consumed:  ${totalSpent.toLocaleString()}`);
    console.log(`Wallet Balance:   ${window.userTokens.toLocaleString()}`);
    console.log("-----------------------------------------");

    for (const [name, info] of Object.entries(summary)) {
      const colors = window.rarityColors || {};
      const rarityColor = colors[info.rarity.toLowerCase()] || "#FFFFFF";
      console.log(
        `- %c${name} [%c${info.rarity}%c] x${info.count}`, 
        `color: ${rarityColor}; font-weight: bold;`, 
        `color: ${rarityColor}; font-style: italic;`, 
        "color: inherit; font-weight: normal;"
      );
    }
    console.log("=========================================");

  } catch (err) {
    console.error("❌ Automation error:", err.message);
  }
}

function injectPackOpenerButton() {
  document.getElementById("autoPackOpenerBtn")?.remove();

  const btn = document.createElement("button");
  btn.id = "autoPackOpenerBtn";
  btn.innerText = "Bulk Opener";
  
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    padding: 12px 20px;
    background-color: #6f057a;
    color: white;
    font-family: 'Pixelify Sans', sans-serif;
    font-size: 15px;
    font-weight: bold;
    border: 4px solid rgba(238, 238, 238, 0.6);
    border-radius: 12px;
    cursor: pointer;
    box-shadow: 3px 3px 15px rgba(0,0,0,0.5);
    transition: transform 0.15s ease;
  `;

  btn.onmouseenter = () => btn.style.transform = "scale(1.08)";
  btn.onmouseleave = () => btn.style.transform = "scale(1)";
  btn.onclick = bulkPromptAndOpenPack;

  document.body.appendChild(btn);
}

injectPackOpenerButton();
