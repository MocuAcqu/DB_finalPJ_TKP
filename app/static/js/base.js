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

        function closeDetailModal() {
            detailModal.style.display = "none";
        }

        closeModal.addEventListener("click", closeDetailModal);

        // 監聽整個 Modal 背景的點擊事件
        detailModal.addEventListener('click', (event) => {
            if (event.target === detailModal) {
                closeDetailModal();
            }
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

            if (!data.ok || !data.comments || data.comments.length === 0) {
                list.innerHTML += '<p class="no-data-placeholder">該商品目前沒有任何公開留言。</p>';
                return;
            }

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

        window.applyResponseFilters = function() {
            const activeTab = tabBar.querySelector(".tab-item.active");
            const activeStatusBtn = statusFilter.querySelector(".status-btn.active");

            const typeFilter = activeTab ? activeTab.dataset.type : "all";
            const statusFilterValue = activeStatusBtn ? activeStatusBtn.dataset.status : "all";

            rows.forEach(row => {
                const rowType = row.dataset.type;
                const rowStatus = row.dataset.status;

                let show = (typeFilter === "all" || rowType === typeFilter) &&
                           (statusFilterValue === "all" || rowStatus === statusFilterValue);
                
                row.style.display = show ? "" : "none";
            });
        }

        tabBar.querySelectorAll(".tab-item").forEach(btn => {
            btn.addEventListener("click", () => {
                tabBar.querySelectorAll(".tab-item").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                window.applyResponseFilters();
            });
        });
        statusFilter.querySelectorAll(".status-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                statusFilter.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                window.applyResponseFilters();
            });
        });

        window.applyResponseFilters();
    })();

    (function setupExchangeFilters() {
        const statusFilter = document.querySelector(".exchange-status-filter");
        const rows = document.querySelectorAll("tr.exchange-row");

        if (!statusFilter || rows.length === 0) {
            return;
        }

        const statusButtons = statusFilter.querySelectorAll(".status-btn");

        function applyExchangeFilter() {
            const activeStatusBtn = statusFilter.querySelector(".status-btn.active");
            const statusFilterValue = activeStatusBtn ? activeStatusBtn.dataset.status : "all";


            rows.forEach(row => {
                const rowStatus = row.dataset.status;
                const show = (statusFilterValue === "all" || rowStatus === statusFilterValue);
                
                row.style.display = show ? "" : "none";
            });
        }

        statusButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                // 移除所有按鈕的 'active' class
                statusButtons.forEach(b => b.classList.remove("active"));
                // 為被點擊的按鈕加上 'active' class
                btn.classList.add("active");
                applyExchangeFilter();
            });
        });

        // 4. 頁面載入時，先執行一次篩選
        applyExchangeFilter();
    })();

    /* =======================================================
    9. 表達興趣：狀態下拉選單 + 自動隱藏買家欄位
    ======================================================= */
    (function setupStatusDropdown() {
        document.querySelectorAll('.status-dropdown').forEach(selectElement => {
            selectElement.addEventListener('change', async function () {
                const newStatus = this.value;
                const row = this.closest('tr.interest-row');
                if (!row) return; // 安全檢查
                const interestId = row.dataset.id;
                
                // 1. 即時更新 tr 的 data-status 屬性，以便篩選
                row.dataset.status = newStatus; 
                
                // 2. 【擴充】如果新狀態是 'done' 或 'rejected'，替換下拉選單
                if (newStatus === "done" || newStatus === "rejected") {
                    const statusCell = this.closest('td.status-cell');
                    if (statusCell) {
                        let statusText = newStatus === 'done' ? '已完成' : '已拒絕';
                        statusCell.innerHTML = `<span class="status-${newStatus}">${statusText}</span>`;
                    }
                }

                // 3. 呼叫篩選函式，即時更新介面
                if (window.applyResponseFilters) {
                    window.applyResponseFilters();
                }

                // 4. 呼叫後端 API 更新狀態 (這部分不變)
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
                        // 如果更新失敗，可以考慮將 UI 恢復原狀
                    }
                } catch (err) {
                    console.error("更新狀態時發生錯誤:", err);
                    alert("更新狀態時發生網路錯誤。");
                }
            });
        });
    })();

    (function setupSortSelect() {
        const sortSelect = document.getElementById('sort-select');
        if (!sortSelect) {
            return;
        }

        sortSelect.addEventListener('change', function() {
            const form = this.closest('form');
            if (form) {
                form.submit();
            }
        });
    })();

    /* =======================================================
    10. (重構) 管理回應：顯示交換請求詳情 Modal
    ======================================================= */
    (function setupExchangeResponseModal() {
        const modal = document.getElementById('exchange-response-modal');
        const closeBtn = document.getElementById('exchange-response-modal-close');
        const titleEl = document.getElementById('response-modal-title');
        const itemsGridEl = document.getElementById('response-offered-items-grid');
        const messageListEl = document.getElementById('response-message-list');
        
        if (!modal || !closeBtn) return;

        function closeModal() {
            modal.style.display = 'none';
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });

        // 將事件監聽器綁定在 document 上
        document.addEventListener('click', async function(event) {
            const button = event.target.closest('.view-exchange-detail-btn');

            if (!button) {
                return;
            }

            try {
                const exchangeId = button.dataset.exchangeId;
                const proposerName = button.dataset.proposerName;
                const targetItemId = button.dataset.itemId;
                const offeredItems = JSON.parse(button.dataset.offeredItems);
                
                titleEl.textContent = `來自 ${proposerName} 的交換請求`;
                
                itemsGridEl.innerHTML = '';
                if (offeredItems && offeredItems.length > 0) {
                    offeredItems.forEach(item => {
                        const itemCard = document.createElement('div');
                        itemCard.className = 'offered-item-card';
                        itemCard.innerHTML = `
                            <img src="/image/${item.image_id}" alt="${item.name}" class="zoomable-image">
                            <p>${item.name}</p>
                        `;
                        itemsGridEl.appendChild(itemCard);
                    });
                } else {
                    itemsGridEl.innerHTML = '<p class="no-data-placeholder">對方未提供交換物品。</p>';
                }

                await loadItemCommentsForResponseModal(targetItemId, proposerName);
                
                modal.style.display = "flex";

            } catch (err) {
                console.error("處理交換詳情點擊時發生錯誤:", err);
                alert("顯示詳情時發生錯誤，請查看控制台。");
            }
        });
        
    })();

    /* =======================================================
    11. (新函式) 專為「回應 Modal」載入「公開商品留言」
    ======================================================= */
    async function loadItemCommentsForResponseModal(itemId, proposerName) {
        const targetElement = document.getElementById('response-message-list');
        
        if (!targetElement) return;

        targetElement.innerHTML = "";

        try {
            // 呼叫獲取「公開商品留言」的 API
            const resp = await fetch(`/item/${itemId}/comments`); 
            if (!resp.ok) throw new Error("伺服器回應錯誤");

            const data = await resp.json();
            
            if (!data.ok || !data.comments || data.comments.length === 0) {
                targetElement.innerHTML = '<p class="no-data-placeholder">該商品目前沒有任何公開留言。</p>';
                return;
            }

            const proposerComments = data.comments.filter(comment => comment.username === proposerName);

            // 2. 檢查篩選後是否還有留言
            if (proposerComments.length === 0) {
                targetElement.innerHTML = '<p class="no-data-placeholder">提出者尚未在此商品頁面留言。</p>';
                return;
            }

            // 3. 只遍歷篩選後的留言陣列
            proposerComments.forEach(c => {
                const div = document.createElement("div");
                div.className = "comment-item";
                div.innerHTML = `
                    <strong>${c.username}</strong>
                    <span class="comment-time">${formatTime(c.timestamp)}</span>
                    <p>${c.text}</p>
                `;
                targetElement.appendChild(div);
            });
        } catch (err) {
            console.error("為回應 Modal 載入留言時失敗:", err);
            targetElement.innerHTML = '<p class="error-message">載入留言失敗。</p>';
        }
    }
    /* =======================================================
       12. (新增) 圖片放大 Lightbox 功能
    ======================================================= */
    (function setupImageLightbox() {
        // 獲取 Lightbox 相關元素
        const lightbox = document.getElementById('image-lightbox');
        if (!lightbox) return; // 如果頁面沒有 lightbox，就直接返回

        const lightboxImg = document.getElementById('lightbox-img');
        const closeBtn = lightbox.querySelector('.lightbox-close');

        // 使用事件委派來監聽所有可放大圖片的點擊
        document.addEventListener('click', function(event) {
            // 檢查被點擊的元素是否是 (或在) 一個帶有 'zoomable-image' class 的元素
            const imageTarget = event.target.closest('.zoomable-image');
            
            if (imageTarget) {
                event.preventDefault(); // 如果圖片在一個 <a> 標籤內，阻止跳轉
                
                // 顯示 Lightbox
                lightbox.style.display = 'flex'; // 使用 flex 來居中
                
                // 設置放大的圖片來源和標題
                lightboxImg.src = imageTarget.src;
            }
        });

        // 關閉 Lightbox 的函式
        function closeLightbox() {
            lightbox.style.display = 'none';
        }

        // 綁定關閉事件
        closeBtn.addEventListener('click', closeLightbox);
        
        // 點擊背景也可以關閉
        lightbox.addEventListener('click', function(event) {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        // 按下 Esc 鍵也可以關閉
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && lightbox.style.display === 'flex') {
                closeLightbox();
            }
        });

    })();
    /* =======================================================
       13. (新增) 管理回應：交換請求狀態下拉選單
    ======================================================= */
    (function setupExchangeStatusDropdown() {
        document.querySelectorAll('.exchange-status-dropdown').forEach(selectElement => {
            selectElement.addEventListener('change', async function() {
                const newStatus = this.value;
                const exchangeId = this.dataset.exchangeId;

                try {
                    const resp = await fetch("/update_exchange_status", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            exchange_id: exchangeId,
                            status: newStatus
                        })
                    });

                    const data = await resp.json();
                    if (data.ok) {
                        // 更新成功後，將下拉選單替換為靜態文字，提供即時回饋
                        const statusCell = this.closest('td.status-cell');
                        let statusText = '';
                        let statusClass = '';
                        if (newStatus === 'accepted') {
                            statusText = '已接受';
                            statusClass = 'status-accepted';
                        } else if (newStatus === 'rejected') {
                            statusText = '已拒絕';
                            statusClass = 'status-rejected';
                        }
                        
                        if (statusText) {
                            statusCell.innerHTML = `<span class="${statusClass}">${statusText}</span>`;
                        }
                    } else {
                        alert("狀態更新失敗：" + (data.error || "未知錯誤"));
                        // 如果更新失敗，將下拉選單的值重設回之前的值
                        this.value = this.querySelector('option[selected]').value;
                    }
                } catch (err) {
                    console.error("更新交換狀態時發生錯誤:", err);
                    alert("更新狀態時發生網路錯誤。");
                }
            });
        });
    })();
});

// ============================================
// 批量刪除功能 - EditModeManager 類別
// ============================================

class EditModeManager {
    constructor(config) {
        this.editBtn = document.getElementById(config.editBtnId);
        this.bulkActions = document.getElementById(config.bulkActionsId);
        this.checkboxHeader = document.getElementById(config.checkboxHeaderId);
        this.selectAll = document.getElementById(config.selectAllId);
        this.checkboxClass = config.checkboxClass;
        this.checkboxColClass = config.checkboxColClass;
        this.deleteBtn = document.getElementById(config.deleteBtnId);
        this.cancelBtn = document.getElementById(config.cancelBtnId);
        this.selectedCount = document.getElementById(config.selectedCountId);
        this.deleteType = config.deleteType; // 'interest' 或 'exchange'
        this.isEditMode = false;

        this.init();
    }

    init() {
        // 如果連編輯按鈕都沒有，就直接跳過
        if (!this.editBtn) return;

        // 🔍 檢查這一區有沒有對應的列（checkbox-col1 / checkbox-col2）
        const hasRows = document.querySelectorAll(`.${this.checkboxColClass}`).length > 0;

        // 這一區沒有任何 row 或缺重要元素 → 直接停用編輯按鈕，不初始化
        if (!hasRows || !this.bulkActions || !this.selectedCount) {
            this.editBtn.disabled = true;
            this.editBtn.classList.add("disabled");
            return;
        }

        // ===== 開始綁定事件 =====

        // 編輯按鈕
        this.editBtn.addEventListener("click", () => this.toggleEditMode());

        // 取消按鈕（有才綁）
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener("click", () => this.exitEditMode());
        }

        // 刪除按鈕（有才綁）
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener("click", () => this.deleteSelected());
        }

        // 全選（有 selectAll 才綁，避免上面那區沒 table 時報錯）
        if (this.selectAll) {
            this.selectAll.addEventListener("change", (e) => {
                const checkboxes = document.querySelectorAll(`.${this.checkboxClass}`);
                checkboxes.forEach(cb => {
                    const row = cb.closest("tr");
                    if (!row) return;

                    const isHidden = row.classList.contains("hidden");
                    const isDeletable = row.dataset.deleted === "1";
                    const isDisabled = cb.disabled;

                    if (!isHidden && isDeletable && !isDisabled) {
                        cb.checked = e.target.checked;
                    }
                });
                this.updateSelectedCount();
            });
        }

        // 監聽單個複選框變化（全域事件，但只處理自己的 checkboxClass）
        document.addEventListener("change", (e) => {
            if (e.target.classList.contains(this.checkboxClass)) {
                const cb = e.target;
                const row = cb.closest("tr");
                if (!row) return;

                const isDeletable = row.dataset.deleted === "1";

                // 不可刪除或 disabled → 不允許被打勾
                if (!isDeletable || cb.disabled) {
                    cb.checked = false;
                    this.updateSelectedCount();
                    return;
                }

                this.updateSelectedCount();
            }
        });
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;

        if (this.isEditMode) {
            this.enterEditMode();
        } else {
            this.exitEditMode();
        }
    }

    enterEditMode() {
        if (this.editBtn) {
            this.editBtn.textContent = "完成";
            this.editBtn.classList.add("active");
        }
        if (this.bulkActions) {
            this.bulkActions.classList.add("show");
        }
        if (this.checkboxHeader) {
            this.checkboxHeader.classList.remove("hidden");
        }

        const checkboxCols = document.querySelectorAll(`.${this.checkboxColClass}`);
        checkboxCols.forEach(col => col.classList.remove("hidden"));

        this.updateSelectedCount();
    }

    exitEditMode() {
        this.isEditMode = false;

        if (this.editBtn) {
            this.editBtn.textContent = "移除已刪除的物品";
            this.editBtn.classList.remove("active");
        }
        if (this.bulkActions) {
            this.bulkActions.classList.remove("show");
        }
        if (this.checkboxHeader) {
            this.checkboxHeader.classList.add("hidden");
        }

        const checkboxCols = document.querySelectorAll(`.${this.checkboxColClass}`);
        checkboxCols.forEach(col => col.classList.add("hidden"));

        // 取消所有選擇
        const checkboxes = document.querySelectorAll(`.${this.checkboxClass}`);
        checkboxes.forEach(cb => (cb.checked = false));

        if (this.selectAll) {
            this.selectAll.checked = false;
        }

        this.updateSelectedCount();
    }

    updateSelectedCount() {
        // 若沒有這些元素，就不用做了（例如那一區根本沒啟用）
        if (!this.selectedCount || !this.deleteBtn) return;

        const checkboxes = document.querySelectorAll(`.${this.checkboxClass}`);

        // 目前有顯示、且「可刪除」的 checkbox
        const visibleDeletable = Array.from(checkboxes).filter((cb) => {
            const row = cb.closest("tr");
            if (!row) return false;

            const isHidden = row.classList.contains("hidden");
            const isDeletable = row.dataset.deleted === "1";
            const isDisabled = cb.disabled;

            return !isHidden && isDeletable && !isDisabled;
        });

        const checkedCount = visibleDeletable.filter((cb) => cb.checked).length;

        this.selectedCount.textContent = `已選擇 ${checkedCount} 項`;
        this.deleteBtn.disabled = checkedCount === 0;

        if (this.selectAll) {
            const allChecked =
                visibleDeletable.length > 0 &&
                visibleDeletable.every((cb) => cb.checked);
            this.selectAll.checked = allChecked;
        }
    }

    deleteSelected() {
        const checkboxes = document.querySelectorAll(
            `.${this.checkboxClass}:checked`
        );

        if (checkboxes.length === 0) return;

        // 只取真正可刪除的
        const validCheckboxes = Array.from(checkboxes).filter((cb) => {
            const row = cb.closest("tr");
            if (!row) return false;
            const isDeletable = row.dataset.deleted === "1";
            const isDisabled = cb.disabled;
            return isDeletable && !isDisabled;
        });

        if (validCheckboxes.length === 0) {
            alert("目前沒有可以刪除的項目。");
            return;
        }

        if (confirm(`確定要刪除選取的 ${validCheckboxes.length} 個項目嗎?`)) {
            const idsToDelete = [];
            validCheckboxes.forEach((cb) => {
                const row = cb.closest("tr");
                const id = row.dataset.id;
                idsToDelete.push(id);

                // 前端視覺效果
                row.style.opacity = "0";
                row.style.transition = "opacity 0.3s";
                setTimeout(() => row.remove(), 300);
            });

            // 發送到後端刪除
            this.sendDeleteRequest(idsToDelete);

            setTimeout(() => {
                this.updateSelectedCount();
            }, 350);
        }
    }

    sendDeleteRequest(ids) {
        // 根據類型決定路由
        const url =
            this.deleteType === "interest"
                ? "/delete-interests"
                : "/delete-exchanges";

        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ ids: ids }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.ok) {
                    console.log("刪除成功:", data.message);
                } else {
                    alert("刪除失敗: " + (data.error || "未知錯誤"));
                    location.reload();
                }
            })
            .catch((error) => {
                console.error("刪除失敗:", error);
                alert("刪除失敗，請稍後再試");
                location.reload();
            });
    }
}

// ============================================
// 初始化編輯模式 (僅在 responses 頁面)
// ============================================

document.addEventListener("DOMContentLoaded", function () {
    // 檢查是否在 responses 頁面
    const isResponsesPage = document.getElementById("editModeBtn1") !== null;

    if (isResponsesPage) {
        // 初始化表達興趣表格的編輯模式
        const interestEditMode = new EditModeManager({
            editBtnId: "editModeBtn1",
            bulkActionsId: "bulkActions1",
            checkboxHeaderId: "checkboxHeader1",
            selectAllId: "selectAll1",
            checkboxClass: "interest-checkbox",
            checkboxColClass: "checkbox-col1",
            deleteBtnId: "deleteBtn1",
            cancelBtnId: "cancelBtn1",
            selectedCountId: "selectedCount1",
            deleteType: "interest",
        });

        // 初始化交換請求表格的編輯模式
        const exchangeEditMode = new EditModeManager({
            editBtnId: "editModeBtn2",
            bulkActionsId: "bulkActions2",
            checkboxHeaderId: "checkboxHeader2",
            selectAllId: "selectAll2",
            checkboxClass: "exchange-checkbox",
            checkboxColClass: "checkbox-col2",
            deleteBtnId: "deleteBtn2",
            cancelBtnId: "cancelBtn2",
            selectedCountId: "selectedCount2",
            deleteType: "exchange",
        });

        // 篩選功能 - 表達興趣
        const responsesTabBar = document.querySelectorAll(
            ".responses-tab-bar .tab-item"
        );
        if (responsesTabBar.length > 0) {
            responsesTabBar.forEach((tab) => {
                tab.addEventListener("click", function (e) {
                    e.preventDefault();
                    responsesTabBar.forEach((t) => t.classList.remove("active"));
                    this.classList.add("active");
                    filterInterests();
                    interestEditMode.updateSelectedCount();
                });
            });
        }

        const responsesStatusFilter = document.querySelectorAll(
            ".responses-status-filter .status-btn"
        );
        if (responsesStatusFilter.length > 0) {
            responsesStatusFilter.forEach((btn) => {
                btn.addEventListener("click", function () {
                    responsesStatusFilter.forEach((b) =>
                        b.classList.remove("active")
                    );
                    this.classList.add("active");
                    filterInterests();
                    interestEditMode.updateSelectedCount();
                });
            });
        }

        // 篩選功能 - 交換請求
        const exchangeStatusFilter = document.querySelectorAll(
            ".exchange-status-filter .status-btn"
        );
        if (exchangeStatusFilter.length > 0) {
            exchangeStatusFilter.forEach((btn) => {
                btn.addEventListener("click", function () {
                    exchangeStatusFilter.forEach((b) =>
                        b.classList.remove("active")
                    );
                    this.classList.add("active");
                    filterExchanges();
                    exchangeEditMode.updateSelectedCount();
                });
            });
        }

        // 篩選函數
        function filterInterests() {
            const activeTab = document.querySelector(
                ".responses-tab-bar .tab-item.active"
            );
            const activeStatusBtn = document.querySelector(
                ".responses-status-filter .status-btn.active"
            );

            if (!activeTab || !activeStatusBtn) return;

            const activeType = activeTab.dataset.type;
            const activeStatus = activeStatusBtn.dataset.status;

            document.querySelectorAll(".interest-row").forEach((row) => {
                const rowType = row.dataset.type;
                const rowStatus = row.dataset.status;

                const typeMatch = activeType === "all" || rowType === activeType;
                const statusMatch =
                    activeStatus === "all" || rowStatus === activeStatus;

                if (typeMatch && statusMatch) {
                    row.classList.remove("hidden");
                } else {
                    row.classList.add("hidden");
                }
            });
        }

        function filterExchanges() {
            const activeStatusBtn = document.querySelector(
                ".exchange-status-filter .status-btn.active"
            );

            if (!activeStatusBtn) return;

            const activeStatus = activeStatusBtn.dataset.status;

            document.querySelectorAll(".exchange-row").forEach((row) => {
                const rowStatus = row.dataset.status;
                const statusMatch =
                    activeStatus === "all" || rowStatus === activeStatus;

                if (statusMatch) {
                    row.classList.remove("hidden");
                } else {
                    row.classList.add("hidden");
                }
            });
        }
    }
});
