document.addEventListener("DOMContentLoaded", () => {

    /* =======================================================
       1. 買賣 / 租借：表達興趣 Modal
    ======================================================= */
    const interestModal = document.getElementById('interest-modal');
    const modalSellerName = document.getElementById('modal-seller-name');
    const modalSellerEmail = document.getElementById('modal-seller-email');
    const interestCloseBtn = document.getElementById('interest-modal-close');

    function openInterestModal(sellerName, sellerEmail) {
        modalSellerName.textContent = sellerName;
        modalSellerEmail.textContent = sellerEmail;
        interestModal.style.display = 'flex';
    }

    function closeInterestModal() {
        interestModal.style.display = 'none';
    }

    if (interestCloseBtn) {
        interestCloseBtn.addEventListener('click', closeInterestModal);
    }

    if (interestModal) {
        interestModal.addEventListener('click', (e) => {
            if (e.target === interestModal) closeInterestModal();
        });
    }

    document.querySelectorAll(".interest-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const itemId = btn.dataset.itemId;
            const ownerId = btn.dataset.ownerId;
            const txType = btn.dataset.transactionType;
            const itemName = btn.dataset.itemName;

            try {
                const resp = await fetch("/express_interest", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        item_id: itemId,
                        owner_id: ownerId,
                        transaction_type: txType, 
                        item_name: itemName
                    })
                });

                const data = await resp.json();
                if (data.ok) {
                    openInterestModal(btn.dataset.sellerName, btn.dataset.sellerEmail);
                } else {
                    alert(data.error || "送出失敗");
                }
            } catch (e) {
                console.error(e);
                alert("發生錯誤");
            }
        });
    });


    /* =======================================================
       2. 詳細資訊 Modal：商品資訊 + 商品留言 + 交換多選
    ======================================================= */
    const detailModal = document.getElementById("detail-modal");
    const closeModal = document.getElementById("detail-modal-close");

    let currentItemId = null;          // 🟣 商品 ID（留言用）
    let currentTargetItemId = null;    // 🟣 要交換的物品 ID
    window.selectedProposedItemIds = new Set();  // 🟣 用來交換的物品（多選）

    if (detailModal && closeModal) {
        document.querySelectorAll(".view-detail-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                const itemId = btn.dataset.itemId;
                currentItemId = itemId;
                currentTargetItemId = itemId;

                try {
                    const resp = await fetch(`/item/detail/${itemId}`);
                    const data = await resp.json();

                    // ⭐ 商品資訊
                    document.getElementById("detail-title").textContent = data.name;
                    document.getElementById("detail-seller").textContent = data.seller;
                    document.getElementById("detail-description").textContent = data.description;
                    document.getElementById("detail-image").src = `/image/${data.image_id}`;

                    const tagBox = document.getElementById("detail-tags");
                    tagBox.innerHTML = (data.tags || [])
                        .map(t => `<span class="tag">#${t}</span>`)
                        .join("");

                    // ⭐ 商品公開留言
                    await loadItemComments(currentItemId);

                    // ⭐ 載入「我的物品」供交換多選
                    await loadUserItems(currentTargetItemId);

                    detailModal.style.display = "flex";

                } catch (err) {
                    console.error(err);
                    alert("載入詳情失敗");
                }
            });
        });

        closeModal.addEventListener("click", () => {
            detailModal.style.display = "none";
        });
    }


    /* =======================================================
       3. 商品留言：載入
    ======================================================= */
    async function loadItemComments(itemId) {
        const list = document.getElementById("exchange-message-list");
        list.innerHTML = "";

        try {
            const resp = await fetch(`/item/${itemId}/comments`);
            const data = await resp.json();

            if (!data.ok) return;

            (data.comments || []).forEach(c => {
                const div = document.createElement("div");
                div.className = "comment-item";
                div.innerHTML = `
                    <strong>${c.username}</strong>
                    <span class="comment-time">${formatTime(c.timestamp)}</span>
                    <p>${c.text}</p>
                `;
                list.appendChild(div);
            });
        } catch (err) {
            console.error(err);
        }
    }


    /* =======================================================
       4. 商品留言：送出
    ======================================================= */
    const msgSubmitBtn = document.getElementById("exchange-message-submit");
    if (msgSubmitBtn) {
        msgSubmitBtn.addEventListener("click", async () => {
            const textarea = document.getElementById("exchange-message-text");
            const text = textarea.value.trim();
            if (!text || !currentItemId) return;

            try {
                const resp = await fetch(`/item/${currentItemId}/comments`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text })
                });

                const data = await resp.json();
                if (data.ok) {
                    appendItemComment(data.comment);
                    textarea.value = "";
                } else {
                    alert(data.error || "留言失敗");
                }

            } catch (err) {
                console.error(err);
                alert("留言發送失敗");
            }
        });
    }

    function appendItemComment(c) {
        const list = document.getElementById("exchange-message-list");
        const div = document.createElement("div");
        div.className = "comment-item";
        div.innerHTML = `
            <strong>${c.username}</strong>
            <span class="comment-time">${formatTime(c.timestamp)}</span>
            <p>${c.text}</p>
        `;
        list.appendChild(div);
    }


    /* =======================================================
       5. 交換多選：載入我的物品
    ======================================================= */
    async function loadUserItems(targetItemId) {
        const container = document.getElementById("exchange-item-list");
        const submitBtn = document.getElementById("exchange-submit-btn");

        container.innerHTML = "";
        window.selectedProposedItemIds.clear();
        submitBtn.disabled = true;
        submitBtn.classList.remove("enabled");

        try {
            const resp = await fetch("/user/my_items");
            const data = await resp.json();
            if (!data.ok) return;

            (data.items || []).forEach(item => {
                const div = document.createElement("div");
                div.className = "exchange-item-card";
                div.dataset.id = item._id;

                div.innerHTML = `
                    <img src="/image/${item.image_id}">
                    <p>${item.name}</p>
                `;

                div.addEventListener("click", () => {
                    const id = item._id;

                    if (window.selectedProposedItemIds.has(id)) {
                        window.selectedProposedItemIds.delete(id);
                        div.classList.remove("selected");
                    } else {
                        window.selectedProposedItemIds.add(id);
                        div.classList.add("selected");
                    }

                    if (window.selectedProposedItemIds.size > 0) {
                        submitBtn.disabled = false;
                        submitBtn.classList.add("enabled");
                    } else {
                        submitBtn.disabled = true;
                        submitBtn.classList.remove("enabled");
                    }
                });

                container.appendChild(div);
            });

        } catch (err) {
            console.error(err);
        }
    }


    /* =======================================================
       6. 送出交換請求（多件交換）
    ======================================================= */
    const exchangeSubmitBtn = document.getElementById("exchange-submit-btn");
    if (exchangeSubmitBtn) {
        exchangeSubmitBtn.addEventListener("click", async () => {

            if (!currentTargetItemId || window.selectedProposedItemIds.size === 0)
                return;

            try {
                const resp = await fetch("/exchange/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        target_item_id: currentTargetItemId,
                        proposed_item_ids: Array.from(window.selectedProposedItemIds)
                    })
                });

                const data = await resp.json();
                if (data.ok) {
                    alert("交換請求已送出！");
                } else {
                    alert(data.error || "交換請求失敗");
                }

            } catch (err) {
                console.error(err);
                alert("交換請求發送失敗");
            }
        });
    }


    /* =======================================================
       7. 時間格式化
    ======================================================= */
    function formatTime(isoString) {
        if (!isoString) return "";
        const t = new Date(isoString);
        return `${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`;
    }

    /* =======================================================
       8. 管理回應專區：類型 + 狀態篩選
    ======================================================= */
    (function setupResponseFilters() {
        const tabBar = document.querySelector(".responses-tab-bar");
        const statusFilter = document.querySelector(".responses-status-filter");
        const rows = document.querySelectorAll("tr.interest-row");

        // 這頁沒出現就略過（避免其它頁報錯）
        if (!tabBar || !statusFilter || rows.length === 0) return;

        const tabItems = tabBar.querySelectorAll(".tab-item");
        const statusButtons = statusFilter.querySelectorAll(".status-btn");

        function applyFilter() {
            const activeTab = tabBar.querySelector(".tab-item.active");
            const activeStatusBtn = statusFilter.querySelector(".status-btn.active");

            const typeFilter = activeTab ? (activeTab.dataset.type || "all") : "all";
            const statusFilterValue = activeStatusBtn ? (activeStatusBtn.dataset.status || "all") : "all";

            rows.forEach(row => {
                const rowType = row.dataset.type || "unknown";
                const rowStatus = row.dataset.status || "pending";

                let show = true;

                if (typeFilter !== "all" && rowType !== typeFilter) {
                    show = false;
                }

                if (statusFilterValue !== "all" && rowStatus !== statusFilterValue) {
                    show = false;
                }

                row.style.display = show ? "" : "none";
            });
        }

        // 類型 tab 點擊
        tabItems.forEach(btn => {
            btn.addEventListener("click", () => {
                tabItems.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                applyFilter();
            });
        });

        // 狀態按鈕點擊
        statusButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                statusButtons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                applyFilter();
            });
        });

        // 初始套用一次（避免未登入、或資料很多時）
        applyFilter();
    })();

    /* =======================================================
    9. 表達興趣：狀態下拉選單 + 自動隱藏買家欄位
    ======================================================= */
    (function setupStatusDropdown() {
        const selects = document.querySelectorAll('.status-dropdown');

        if (selects.length === 0) return;

        selects.forEach(sel => {

            // 初始化：根據現在狀態 hide/顯示買家欄位
            toggleBuyerCell(sel);

            sel.addEventListener('change', async function () {
                const newStatus = this.value;
                const interestId = this.dataset.id;

                // 前端更新 buyer 欄位顯示
                toggleBuyerCell(this);

                // ===== 呼叫後端更新狀態 =====
                try {
                    const resp = await fetch("/update_interest_status", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            interest_id: interestId,
                            status: newStatus
                        })
                    });

                    const data = await resp.json();
                    if (!data.ok) {
                        alert("狀態更新失敗：" + (data.error || ""));
                    }

                } catch (err) {
                    console.error(err);
                    alert("更新狀態時發生錯誤");
                }
            });

        });

        // 負責隱藏/顯示「買家欄位」
        function toggleBuyerCell(selectEl) {
            const status = selectEl.value;
            const row = selectEl.closest("tr");
            if (!row) return;

            const buyerCell = row.children[1]; // 第二欄是買家

            if (status === "done") {
                buyerCell.style.display = "none";
            } else {
                buyerCell.style.display = "";
            }
        }

    })();

});
