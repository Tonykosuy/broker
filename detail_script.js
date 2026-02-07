// Assuming VN100_FULL and INDUSTRY_MAP are available from vn100_list.js

const API_BASE = 'https://finfo-api.vndirect.com.vn/v4';
const FIIN_API_BASE = 'https://datafeed.fiingroup.vn/api'; // Placeholder Base URL
const FIIN_TOKEN = 'YOUR_FIIN_TOKEN'; // User must provide this
const PROXY = ''; // If needed, but trying direct first

// DOM Elements
const stockListEl = document.getElementById('stock-list');
const searchInput = document.getElementById('stock-search');
const loadingEl = document.getElementById('loading');
const mainContentEl = document.getElementById('detail-content');
const companyHeaderEl = document.getElementById('company-header');
const initialStateEl = document.getElementById('initial-state');
const errorStateEl = document.getElementById('error-state');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// State
let currentSymbol = '';

// Initialize
function init() {
    renderStockList();

    // Search listener
    searchInput.addEventListener('input', (e) => {
        renderStockList(e.target.value);
    });

    // Tab listener
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

// Render Sidebar List
function renderStockList(filter = '') {
    stockListEl.innerHTML = '';
    const uniqueStocks = [...new Set(VN100_FULL)].sort();

    uniqueStocks.forEach(symbol => {
        if (filter && !symbol.toLowerCase().includes(filter.toLowerCase())) return;

        const li = document.createElement('li');
        li.className = 'stock-item';
        li.textContent = symbol;
        if (symbol === currentSymbol) li.classList.add('active');

        li.addEventListener('click', () => selectStock(symbol));
        stockListEl.appendChild(li);
    });
}

async function selectStock(symbol) {
    if (currentSymbol === symbol) return;
    currentSymbol = symbol;

    // UI Updates
    renderStockList(searchInput.value); // Re-render to update active class
    initialStateEl.style.display = 'none';
    errorStateEl.style.display = 'none';
    mainContentEl.style.display = 'none';
    companyHeaderEl.style.display = 'none';
    loadingEl.style.display = 'flex';

    try {
        await fetchAndRenderData(symbol);
        loadingEl.style.display = 'none';
        companyHeaderEl.style.display = 'flex';
        mainContentEl.style.display = 'block';
    } catch (err) {
        console.error(err);
        loadingEl.style.display = 'none';
        errorStateEl.style.display = 'flex';
        document.getElementById('error-msg').textContent = `Không thể tải dữ liệu cho ${symbol}. Vui lòng thử lại.`;
    }
}

async function fetchAndRenderData(symbol) {
    // 1. Profile (VNDirect)
    const profile = await fetchProfile(symbol);
    renderHeader(profile);
    renderProfile(profile);

    // 2. News (VNDirect)
    fetchNews(symbol);

    // 3. Events (VNDirect)
    fetchEvents(symbol);

    // 4. Subsidiaries (FiinGroup)
    fetchFiinRelationships(symbol);

    // 5. Analysis & Financials (VNDirect + FiinGroup Insight)
    fetchAnalysis(symbol);
    fetchFiinInsight(symbol);

    // 6. Business Registration (FiinGroup)
    fetchFiinBizReg(symbol);
}

async function fetchNews(symbol) {
    const newsListEl = document.getElementById('news-list');
    const docListEl = document.getElementById('documents-list');

    newsListEl.innerHTML = '<div class="spinner"></div>';

    try {
        const url = `${API_BASE}/news?symbol=${symbol}&size=20`;
        const res = await fetch(url);
        const json = await res.json();
        const items = json.data || [];

        renderNews(items, newsListEl);
        renderDocuments(items, docListEl);
    } catch (e) {
        newsListEl.innerHTML = '<p>Không tải được tin tức.</p>';
        console.error(e);
    }
}

async function fetchEvents(symbol) {
    const eventsListEl = document.getElementById('events-list');
    eventsListEl.innerHTML = '<div class="spinner"></div>';

    try {
        const url = `${API_BASE}/events?symbol=${symbol}&size=20`;
        const res = await fetch(url);
        const json = await res.json();
        const items = json.data || [];

        renderEvents(items, eventsListEl);
    } catch (e) {
        eventsListEl.innerHTML = '<p>Không tải được sự kiện.</p>';
    }
}

// Rendering Functions
function renderHeader(data) {
    document.getElementById('company-symbol').textContent = data.symbol || currentSymbol;
    document.getElementById('company-name').textContent = data.companyName || '---';
    document.getElementById('industry').textContent = data.industryName || '---';
    document.getElementById('exchange').textContent = data.floor || 'HOSE';

    // Logo: data.logo usually not in V4 profile directly, might be constructed like:
    // https://www.vndirect.com.vn/vendors/stock-images/HPG.png (Legacy)
    // or https://fireant.vn/static/logos/HPG.jpg
    document.getElementById('company-logo').src = `https://finance.vietstock.vn/image/${currentSymbol}`;
}

function renderProfile(data) {
    document.getElementById('profile-summary').textContent = data.overview || 'Chưa có thông tin giới thiệu.';
    document.getElementById('address').textContent = data.address || '---';
    document.getElementById('phone').textContent = data.phone || '---';
    document.getElementById('website').textContent = data.website || '---';
    document.getElementById('website').href = data.website || '#';
    document.getElementById('listing-date').textContent = data.listingDate ? new Date(data.listingDate).toLocaleDateString() : '---';

    // Leadership placeholder if not available in this endpoint
    const leadershipList = document.getElementById('leadership-list');
    leadershipList.innerHTML = `<p>Cập nhật sau... (Dữ liệu API chưa đầy đủ)</p>`;
    // Note: To get leadership, might need a different API.
    // But text often mentions Chairman.
}

function renderNews(items, container) {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = '<p>Không có tin tức.</p>';
        return;
    }

    items.forEach(item => {
        const date = new Date(item.newsDate || item.publishedDate).toLocaleDateString('vi-VN');
        const div = document.createElement('div');
        div.className = 'news-item';
        div.innerHTML = `
            <div class="item-meta">
                <span><i class="far fa-clock"></i> ${date}</span>
                <span>${item.source || 'VNDirect'}</span>
            </div>
            <a href="${item.newsUrl || '#'}" target="_blank" class="item-title">${item.title}</a>
            <div class="item-summary">${item.newsType || ''}</div>
        `;
        container.appendChild(div);
    });
}

function renderDocuments(items, container) {
    container.innerHTML = '';
    // Filter logic: Look for keywords
    const keywords = ['nghị quyết', 'báo cáo', 'tài liệu', 'giải trình', 'bctc', 'thông báo'];
    const docs = items.filter(item => {
        const title = item.title.toLowerCase();
        return keywords.some(k => title.includes(k));
    });

    if (docs.length === 0) {
        container.innerHTML = '<p>Không tìm thấy tài liệu gần đây trong tin tức.</p>';
        return;
    }

    docs.forEach(item => {
        const date = new Date(item.newsDate || item.publishedDate).toLocaleDateString('vi-VN');
        const div = document.createElement('div');
        div.className = 'doc-item';
        div.innerHTML = `
            <div class="item-meta">
                <span><i class="far fa-clock"></i> ${date}</span>
            </div>
            <a href="${item.newsUrl || '#'}" target="_blank" class="item-title"><i class="far fa-file-pdf"></i> ${item.title}</a>
        `;
        container.appendChild(div);
    });
}

function renderEvents(items, container) {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = '<p>Không có sự kiện sắp tới.</p>';
        return;
    }

    items.forEach(item => {
        const date = new Date(item.localeDate || item.date).toLocaleDateString('vi-VN');
        const div = document.createElement('div');
        div.className = 'event-item';
        div.innerHTML = `
             <div class="item-meta">
                <span><i class="far fa-calendar-check"></i> ${date}</span>
                <span style="color: var(--primary-color)">${item.type || 'Sự kiện'}</span>
            </div>
            <div class="item-title">${item.content || item.title}</div>
        `;
        container.appendChild(div);
    });
}

function switchTab(tabName) {
    // Buttons
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Content
    tabPanes.forEach(pane => {
        if (pane.id === tabName) pane.classList.add('active');
        else pane.classList.remove('active');
    });
}

// ... SwitchTab above ...

function renderAnalysis(data, container) {
    container.innerHTML = '';

    // Mapping keys to labels
    const metrics = [
        { key: 'pe', label: 'P/E' },
        { key: 'pb', label: 'P/B' },
        { key: 'eps', label: 'EPS' },
        { key: 'roe', label: 'ROE' },
        { key: 'roa', label: 'ROA' },
        { key: 'netProfitMargin', label: 'Biên lợi nhuận ròng' },
        { key: 'quickRatio', label: 'Thanh toán nhanh' },
        { key: 'currentRatio', label: 'Thanh toán hiện hành' }
    ];

    metrics.forEach(m => {
        const val = data[m.key] !== undefined ? data[m.key] : '---';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.label}</td>
            <td>${typeof val === 'number' ? val.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : val}</td>
        `;
        container.appendChild(tr);
    });
}

function renderFinancials(data, container) {
    container.innerHTML = '';
    // Use some overlap with ratio or different data if available
    const metrics = [
        { key: 'marketCap', label: 'Vốn hóa thị trường' },
        { key: 'totalAssets', label: 'Tổng tài sản' },
        { key: 'equity', label: 'Vốn chủ sở hữu' },
        { key: 'revenue', label: 'Doanh thu thuần (Gần nhất)' },
        { key: 'netProfit', label: 'Lợi nhuận sau thuế' }
    ];

    metrics.forEach(m => {
        const val = data[m.key] !== undefined ? data[m.key] : '---';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.label}</td>
            <td>${typeof val === 'number' ? val.toLocaleString('vi-VN') : val}</td>
        `;
        container.appendChild(tr);
    });
}

// --- FiinGroup Implementations ---

async function fetchFiinRelationships(symbol) {
    const listEl = document.getElementById('subsidiaries-list');
    listEl.innerHTML = '<div class="spinner"></div>';

    try {
        // Endpoint: /Company/GetOrganizationRole
        const url = `${FIIN_API_BASE}/Company/GetOrganizationRole?Ticker=${symbol}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${FIIN_TOKEN}` } });

        if (!res.ok) throw new Error('FiinGroup API Error');

        const json = await res.json();
        const data = json.data || [];

        if (data.length === 0) {
            listEl.innerHTML = '<p>Không có dữ liệu công ty liên kết.</p>';
            return;
        }

        listEl.innerHTML = '';
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'sub-item';
            div.innerHTML = `
                <h4>${item.RightOrganCode || item.LeftOrganCode}</h4>
                <p>Mối quan hệ ID: ${item.RightRoleId || item.LeftRoleId}</p>
                <small>Cập nhật: ${new Date(item.UpdateDate || Date.now()).toLocaleDateString()}</small>
            `;
            listEl.appendChild(div);
        });

    } catch (e) {
        console.warn('FiinGroup Relationships fetch failed', e);
        listEl.innerHTML = `<p class="text-danger">Cần API Key FiinGroup để xem chi tiết.</p>`;
    }
}

async function fetchFiinBizReg(symbol) {
    try {
        const url = `${FIIN_API_BASE}/Company/GetCompanyInformation?Ticker=${symbol}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${FIIN_TOKEN}` } });
        if (!res.ok) return;

        const json = await res.json();
        const data = json.data || {};

        if (data.TaxCode) {
            const container = document.querySelector('.info-grid');
            if (container) {
                container.innerHTML += `
                    <div class="info-item"><label>Mã số thuế:</label> <span>${data.TaxCode}</span></div>
                    <div class="info-item"><label>Mã doanh nghiệp:</label> <span>${data.EnterpriseCode}</span></div>
                    <div class="info-item"><label>Ngày thành lập:</label> <span>${new Date(data.FoundingDate).toLocaleDateString()}</span></div>
                `;
            }
        }
    } catch (e) {
        console.warn('FiinGroup BizReg fetch failed');
    }
}

async function fetchFiinInsight(symbol) {
    const container = document.getElementById('analysis-content');
    if (!container) return;

    try {
        const url = `${FIIN_API_BASE}/Company/GetCompanyInsight?Ticker=${symbol}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${FIIN_TOKEN}` } });
        if (!res.ok) return;

        const json = await res.json();
        const data = json.data || {};

        if (data.Promise || data.BusinessRisks) {
            const div = document.createElement('div');
            div.className = 'card mt-20 insight-content';
            div.innerHTML = `
                <h3>Phân tích chuyên sâu (FiinGroup)</h3>
                ${data.Promise ? `<h4>Triển vọng</h4><div>${data.Promise}</div>` : ''}
                ${data.BusinessRisks ? `<h4>Rủi ro kinh doanh</h4><div>${data.BusinessRisks}</div>` : ''}
            `;
            container.prepend(div);
        }
    } catch (e) {
        console.warn('FiinGroup Insight fetch failed');
    }
}


// Start
document.addEventListener('DOMContentLoaded', init);
