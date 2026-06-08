const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function customConfirmModal(message) {
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
      min-width: 340px; color: white; font-family: 'Pixelify Sans', sans-serif;
      font-size: 18px; display: flex; flex-direction: column; gap: 15px;
    `;

    const titleText = document.createElement("div");
    titleText.innerText = message;
    titleText.style.whiteSpace = "pre-line";

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display: flex; gap: 10px; justify-content: center; margin-top: 5px;`;

    const yesBtn = document.createElement("button");
    yesBtn.innerText = "Sell Duplicates";
    yesBtn.style.cssText = `padding: 10px 20px; background: #4bc22e; color: white; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold;`;

    const noBtn = document.createElement("button");
    noBtn.innerText = "Cancel";
    noBtn.style.cssText = `padding: 10px 20px; background: #be0000; color: white; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: bold;`;

    btnRow.append(yesBtn, noBtn);
    box.append(titleText, btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    yesBtn.onclick = () => { resolve(true); overlay.remove(); };
    noBtn.onclick = () => { resolve(false); overlay.remove(); };
  });
}

async function sellAllDuplicateBlooks() {
  console.log("Fetching current inventory profile...");
  
  try {
    const loggedRes = await fetch("/api/loggedin", { credentials: "include" });
    const loggedData = await loggedRes.json();
    if (!loggedRes.ok || !loggedData.loggedIn || !loggedData.user?.id) {
      console.error("Action aborted: You are not currently logged in.");
      return;
    }
    const userId = loggedData.user.id;

    const res = await fetch("/api/userBlooks", { credentials: "include" });
    if (!res.ok) throw new Error("Could not load user blooks database.");
    const data = await res.json();
    
    const packs = data.packs || [];
    const duplicatesQueue = [];
    let estimatedProfit = 0;

    const rarityValues = {
      uncommon: 5,
      rare: 20,
      epic: 75,
      legendary: 200,
      chroma: 300,
      mystical: 1000
    };

    packs.forEach(pack => {
      const blooks = Array.isArray(pack.blooks) ? pack.blooks : [];
      blooks.forEach(blook => {
        const ownedCount = Number(blook.owned ?? 0);
        if (ownedCount > 1) {
          const duplicateQty = ownedCount - 1;
          const pricePer = blook.name === "Pixel" ? 10 : (rarityValues[(blook.rarity || "").toLowerCase()] || 10);
          
          duplicatesQueue.push({
            blookName: blook.name,
            quantity: duplicateQty,
            priceTotal: pricePer * duplicateQty
          });
          
          estimatedProfit += pricePer * duplicateQty;
        }
      });
    });

    if (duplicatesQueue.length === 0) {
      console.log("Clean Inventory! You do not possess any duplicate Blooks.");
      return;
    }

    const confirmationPrompt = `You have duplicates of ${duplicatesQueue.length} unique Blooks.\n\nThis operation will bulk sell all extra copies, keeping exactly 1 original of each.\n\nEstimated Payout: +${estimatedProfit.toLocaleString()} tokens.`;
    const userConfirmed = await customConfirmModal(confirmationPrompt);
    
    if (!userConfirmed) {
      console.log("Execution cancelled by user.");
      return;
    }

    console.clear();
    console.log(`Processing liquidation queue for ${duplicatesQueue.length} Blook variations...`);
    if (typeof window.showLoader === "function") window.showLoader();

    let totalSoldPacks = 0;

    for (let item of duplicatesQueue) {
      console.log(`Liquidation in progress: Selling ${item.quantity}x ${item.blookName}...`);

      const sellRes = await fetch("/api/users/sell-blook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: userId,
          blookName: item.blookName,
          quantity: item.quantity
        })
      });

      if (sellRes.status === 429) {
        console.warn("Rate limit restriction triggered. Cooling down script for 5 seconds...");
        await delay(5000);
        duplicatesQueue.unshift(item);
        continue;
      }

      if (!sellRes.ok) {
        console.error(`Liquidator halted unexpectedly for ${item.blookName}. Status Code: ${sellRes.status}`);
        break;
      }

      const sellResultData = await sellRes.json();
      if (!sellResultData.success) {
        console.warn(`Server rejected transaction for ${item.blookName}: ${sellResultData.error}`);
      } else {
        totalSoldPacks++;
      }

      await delay(1200);
    }

    if (typeof loadBlooks === "function") await loadBlooks();
    if (typeof window.updateTokens === "function") window.updateTokens();

    console.log("\n=========================================");
    console.log(
      `%cLIQUIDATION CLEARING REPORT`, 
      "background: #4bc22e; color: white; font-weight: bold; font-size: 13px; padding: 4px 8px; border-radius: 4px;"
    );
    console.log(`Blook Batches Cleared:  ${totalSoldPacks} / ${duplicatesQueue.length}`);
    console.log(`Estimated Tokens Added: +${estimatedProfit.toLocaleString()}`);
    console.log("Inventory status successfully balanced!");
    console.log("=========================================");

  } catch (error) {
    console.error("Inventory cleanup encountered an error:", error.message);
  } finally {
    if (typeof window.hideLoader === "function") window.hideLoader();
  }
}

function injectDuplicateSellerButton() {
  document.getElementById("autoSellDupesBtn")?.remove();

  const btn = document.createElement("button");
  btn.id = "autoSellDupesBtn";
  btn.innerText = "Sell All Dupes";
  
  btn.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 999999;
    padding: 12px 20px;
    background-color: #be0000;
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
  btn.onclick = sellAllDuplicateBlooks;

  document.body.appendChild(btn);
}

injectDuplicateSellerButton();
