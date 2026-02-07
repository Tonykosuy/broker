
// Logic for Technical Analysis Chart
// Depends on indicators.js and ApexCharts

let analysisData = [];
let mainChart = null;
let indicatorCharts = {}; // Map of indicator key -> chart instance
let currentStockSymbol = ""; // Track current stock

// --- INTEGRATED MARKET DATA ---
const MARKET_DATA = {
    "HOSE": {
        "Ngân hàng": ["VCB", "BID", "CTG", "MBB", "TCB", "ACB", "VPB", "HDB", "STB", "VIB", "TPB", "EIB", "SHB", "OCB", "MSB", "SSB", "LPB"],
        "Bất động sản": ["VIC", "VHM", "VRE", "NVL", "KDH", "PDR", "DIG", "DXG", "NLG", "KBC", "VPI", "HDG", "CRE", "AGG", "TCH", "SCR", "HQC", "DXS"],
        "Chứng khoán": ["SSI", "VND", "VCI", "HCM", "FTS", "BSI", "CTS", "AGR", "VIX", "ORS", "TVS"],
        "Thép & VLXD": ["HPG", "HSG", "NKG", "VGS", "POM", "HT1", "BCC"],
        "Thực phẩm & Đồ uống": ["VNM", "MSN", "SAB", "KDC", "SBT", "VHC", "ANV", "DBC", "PAN", "LTG"],
        "Bán lẻ & Công nghệ": ["MWG", "PNJ", "FRT", "PET", "DGW", "FPT", "CMG", "ELC"],
        "Dầu khí & Năng lượng": ["GAS", "PLX", "POW", "PVD", "PVT", "PXS", "GEG", "NT2", "REE", "PC1"],
        "Phân bón & Hóa chất": ["DPM", "DCM", "DGC", "CSV", "GVR", "PHR", "DPR"],
        "Vận tải & Cảng": ["GMD", "VJC", "HVN", "HAH", "VOS", "PVT"]
    },
    "UPCOM": {
        "Dầu khí (Nổi bật)": ["BSR", "OIL"],
        "Ngân hàng": ["BVB", "NAB", "ABB", "VBB", "KLB", "PGB", "SGB"],
        "Khu Công nghiệp": ["SIP", "NTC", "VRG", "VEF", "VTP"],
        "Viễn thông & CNTT": ["VGI", "FOX", "TTN"],
        "Thực phẩm & Tiêu dùng": ["QNS", "MCH", "MML", "VOC", "VGT"],
        "Cảng & Vận tải": ["ACV", "PHP", "SGP", "VNA"],
        "Năng lượng & Nước": ["QTP", "BWE", "DNW"],
        "Khác": ["VEA", "LTG", "G36", "C4G"]
    }
};

window.renderSectorModal = function () {
    const exchangeSelect = document.getElementById('modal-exchange-select');
    if (!exchangeSelect) return;

    const exchange = exchangeSelect.value;
    const container = document.getElementById('sector-list-container');
    container.innerHTML = ''; // Clear

    const data = MARKET_DATA[exchange];
    if (!data) return;

    Object.keys(data).forEach(industry => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'industry-group';

        const title = document.createElement('div');
        title.className = 'industry-title';
        title.textContent = industry;
        groupDiv.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'stock-grid';

        data[industry].forEach(symbol => {
            const btn = document.createElement('button');
            btn.className = 'stock-btn';
            btn.textContent = symbol;
            btn.onclick = () => window.selectStock(symbol);
            grid.appendChild(btn);
        });

        groupDiv.appendChild(grid);
        container.appendChild(groupDiv);
    });
};


// Strategy Guides Content
async function fetchStockData(symbol, from, to) {
    const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    return await response.json();
}

// Global variable to store ALL results: { strategyKey: report }
let allBacktestReports = {};
let backtestPieChart = null; // Store chart instance


// Initialize
// --- Time Range Helpers ---
function setAnalysisRange() {
    document.querySelectorAll('.quick-date-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const now = new Date();
            const startInput = document.getElementById('analysis-start-date');
            const endInput = document.getElementById('analysis-end-date');

            // Set End Date to Today
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            endInput.value = `${yyyy}-${mm}-${dd}`;

            let past = new Date(now);

            if (btn.dataset.max === "true") {
                // MAX: Lấy thời gian xa trong quá khứ (ví dụ: năm 2000)
                past = new Date('2000-01-01');
            } else if (btn.dataset.weeks) {
                past.setDate(past.getDate() - (parseInt(btn.dataset.weeks) * 7));
            } else if (btn.dataset.months) {
                past.setMonth(past.getMonth() - parseInt(btn.dataset.months));
            } else if (btn.dataset.years) {
                past.setFullYear(past.getFullYear() - parseInt(btn.dataset.years));
            }

            const pyyyy = past.getFullYear();
            const pmm = String(past.getMonth() + 1).padStart(2, '0');
            const pdd = String(past.getDate()).padStart(2, '0');
            startInput.value = `${pyyyy}-${pmm}-${pdd}`;

            // Auto-run analysis
            runAnalysis();
        });
    });
}

function initAnalysis() {
    setAnalysisRange();
    // 2. Setup Quick Date Buttons
    document.querySelectorAll('.quick-date-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const years = e.target.dataset.years;
            const months = e.target.dataset.months;
            const weeks = e.target.dataset.weeks;
            const ytd = e.target.dataset.ytd;
            const today = new Date();
            let startDate = new Date();

            if (ytd) {
                startDate = new Date(today.getFullYear(), 0, 1); // Jan 1st this year
            } else if (years) {
                startDate.setFullYear(today.getFullYear() - parseInt(years));
            } else if (months) {
                startDate.setMonth(today.getMonth() - parseInt(months));
            } else if (weeks) {
                startDate.setDate(today.getDate() - parseInt(weeks) * 7);
            }

            document.getElementById('analysis-end-date').valueAsDate = today;
            document.getElementById('analysis-start-date').valueAsDate = startDate;

            // Visual feedback
            document.querySelectorAll('.quick-date-btn').forEach(b => b.style.fontWeight = 'normal');
            e.target.style.fontWeight = 'bold';
        });
    });

    // Setup Quick Date Buttons
    // ... existing quick date code ... 

    // --- New Static Sector Modal Handlers ---
    window.openSectorModal = function () {
        const modal = document.getElementById('sector-modal');
        if (modal) {
            modal.classList.add('show');
            // Initial Render if empty
            if (document.getElementById('sector-list-container').innerHTML.trim() === '') {
                window.renderSectorModal();
            }
        }
    };

    window.closeSectorModal = function () {
        const modal = document.getElementById('sector-modal');
        if (modal) modal.classList.remove('show');
    };

    window.selectStock = function (symbol) {
        document.getElementById('analysis-stock-input').value = symbol;
        closeSectorModal();
        // Auto trigger analysis
        document.getElementById('analyze-btn').click();
    };


    // Close modal when clicking outside
    window.onclick = function (event) {
        const modal = document.getElementById('sector-modal');
        if (modal && event.target == modal) {
            closeSectorModal();
        }
    };

    document.getElementById('analyze-btn').addEventListener('click', runAnalysis);

    // Setup Toggles
    document.querySelectorAll('.indicator-toggle').forEach(chk => {
        chk.addEventListener('change', updateChartDisplay);
    });

    // Backtest UI Handlers
    // Note: run-backtest-btn might be removed or repurposed. The new flow is Auto-Run.
    // But if we keep it for manual re-run:
    const backtestBtn = document.getElementById('run-backtest-btn');
    if (backtestBtn) {
        backtestBtn.addEventListener('click', () => runAdvancedBacktest());
    }

    // Default Dates (1 Year)
    const today = new Date();
    const lastYear = new Date();
    lastYear.setFullYear(today.getFullYear() - 1);

    if (document.getElementById('analysis-end-date')) document.getElementById('analysis-end-date').valueAsDate = today;
    if (document.getElementById('analysis-start-date')) document.getElementById('analysis-start-date').valueAsDate = lastYear;
}




// Modified runBatchBacktest -> runAdvancedBacktest
async function runAdvancedBacktest() {
    if (Object.keys(allBacktestReports).length === 0) return;

    const btn = document.getElementById('run-backtest-btn');
    const summaryContainer = document.getElementById('bt-summary-container');
    const toggleContainer = document.getElementById('bt-toggle-container');
    const fullContainer = document.getElementById('bt-comparison-container');

    const summaryShort = document.querySelector('#bt-summary-short .content');
    const summaryLong = document.querySelector('#bt-summary-long .content');
    const profitShort = document.querySelector('#bt-profit-summary-short .content');
    const profitLong = document.querySelector('#bt-profit-summary-long .content');

    const profitContainer = document.getElementById('bt-profit-summary-container');

    // UI Cleanup
    fullContainer.innerHTML = '';
    if (summaryShort) summaryShort.innerHTML = '';
    if (summaryLong) summaryLong.innerHTML = '';
    if (profitShort) profitShort.innerHTML = '';
    if (profitLong) profitLong.innerHTML = '';

    document.getElementById('bt-detail-container').style.display = 'none';
    document.getElementById('bt-detail-title').style.display = 'none';

    // 2. Prepare Data
    const aggregatedShort = [];
    const aggregatedLong = [];
    const groupedShort = {};
    const groupedLong = {};

    // 2. Aggregate Results
    const processReport = (stratKey, report, agg, grouped) => {
        Object.keys(report).forEach(timeframe => {
            const r = report[timeframe];
            const item = {
                strategy: stratKey,
                label: Backtester.SUPPORTED_STRATEGIES.find(s => s.key === stratKey)?.label || stratKey,
                timeframe: timeframe,
                tfLabel: Backtester.LABELS?.[timeframe] || parseInt(timeframe) + "N",
                stats: {
                    winRate: r.count > 0 ? (r.wins / r.count * 100) : 0,
                    avgReturn: r.avgReturn || 0,
                    maxWin: r.maxWin || 0,
                    trades: r.count || 0,
                    wins: r.wins || 0,
                    // Estimate Total Return
                    totalReturn: (r.avgReturn || 0) * (r.count || 0)
                }
            };
            agg.push(item);

            if (!grouped[timeframe]) grouped[timeframe] = [];
            grouped[timeframe].push(item);
        });
    };

    Object.keys(allBacktestReports).forEach(stratKey => {
        const r = allBacktestReports[stratKey];
        if (r.short) processReport(stratKey, r.short, aggregatedShort, groupedShort);
        if (r.long) processReport(stratKey, r.long, aggregatedLong, groupedLong);
    });

    // 3. Render Top 3 Summaries (Generic)
    const renderSummary = (items, targetEl, mode = 'winRate', isShort = true) => {
        if (!targetEl) return;

        let top3;
        if (mode === 'profit') {
            // Sort by Total Return Descending
            top3 = items.sort((a, b) => b.stats.totalReturn - a.stats.totalReturn).slice(0, 3);
        } else {
            // Sort by Win Rate Descending
            top3 = items.sort((a, b) => b.stats.winRate - a.stats.winRate).slice(0, 3);
        }

        if (top3.length === 0) {
            targetEl.innerHTML = '<div style="color:#777; font-style:italic;">Không có dữ liệu đủ điều kiện.</div>';
            return;
        }

        top3.forEach((item, idx) => {
            const div = document.createElement('div');
            // Add Rank Class
            div.className = `strategy-card rank-${idx + 1}`;
            div.style.marginBottom = '15px';
            div.style.padding = '15px';
            div.style.background = 'white';
            div.style.borderRadius = '12px';

            // Grid Layout: Left (Big Metric) - Right (Details)
            div.style.display = 'grid';
            div.style.gridTemplateColumns = '40% 60%';
            div.style.gap = '15px';
            div.style.alignItems = 'center';
            div.style.textAlign = 'center'; // Center text globally

            let rankIcon = '';
            if (idx === 0) rankIcon = '🥇';
            if (idx === 1) rankIcon = '🥈';
            if (idx === 2) rankIcon = '🥉';

            const winRateColor = item.stats.winRate >= 50 ? '#2e7d32' : '#d32f2f';
            const totalReturnColor = item.stats.totalReturn >= 0 ? '#2e7d32' : '#d32f2f';

            // --- Mode Specific Display ---
            let leftMetricHtml = '';
            let rightMetricHtml = '';

            if (mode === 'profit') {
                // Big Metric: Total Return
                leftMetricHtml = `
                    <span style="font-size:0.9em; color:#666; margin-bottom:-5px;">TỔNG LÃI</span>
                    <span style="font-size:2.4em; font-weight:800; color:${totalReturnColor}; line-height:1.1;">
                        ${item.stats.totalReturn > 0 ? '+' : ''}${item.stats.totalReturn.toFixed(0)}<span style="font-size:0.4em;">%</span>
                    </span>
                    <span style="font-size:0.8em; background:#eee; padding:2px 8px; border-radius:10px; margin-top:5px;">${item.tfLabel}</span>
                 `;

                // Right Detail: Win Rate
                rightMetricHtml = `
                    <div style="margin-bottom:8px;">
                        <span style="font-size:0.85em; color:#666;">Win Rate:</span>
                        <span style="font-size:1.4em; font-weight:bold; color:${winRateColor}; margin-left:5px;">
                            ${item.stats.winRate.toFixed(1)}%
                        </span>
                    </div>
                 `;
            } else {
                // Big Metric: Win Rate
                leftMetricHtml = `
                    <span style="font-size:0.9em; color:#666; margin-bottom:-5px;">WIN RATE</span>
                    <span style="font-size:2.8em; font-weight:800; color:${winRateColor}; line-height:1.1;">
                        ${item.stats.winRate.toFixed(0)}<span style="font-size:0.4em;">%</span>
                    </span>
                    <span style="font-size:0.8em; background:#eee; padding:2px 8px; border-radius:10px; margin-top:5px;">${item.tfLabel}</span>
                 `;

                // Right Detail: Total Return
                rightMetricHtml = `
                    <div style="margin-bottom:8px;">
                        <span style="font-size:0.85em; color:#666;">Tổng Lãi:</span>
                        <span style="font-size:1.4em; font-weight:bold; color:${totalReturnColor}; margin-left:5px;">
                            ${item.stats.totalReturn > 0 ? '+' : ''}${item.stats.totalReturn.toFixed(1)}%
                        </span>
                    </div>
                 `;
            }

            // Fallback border logic
            if (idx > 2) div.style.borderLeft = '4px solid #999';

            div.innerHTML = `
                <!-- LEFT COLUMN -->
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1px solid rgba(0,0,0,0.05);">
                    ${leftMetricHtml}
                </div>

                <!-- RIGHT COLUMN -->
                <div style="display:flex; flex-direction:column; justify-content:center;">
                    <!-- Header -->
                    <div style="font-weight:bold; color:#333; font-size:1.1em; margin-bottom:8px; display:flex; align-items:center;">
                        ${rankIcon} #${idx + 1} ${item.label}
                    </div>
                    
                    ${rightMetricHtml}

                    <!-- Action Link (Restored & Centered) -->
                    <div style="margin-top:15px; display:flex; justify-content:center; width:100%;">
                         <button onclick="viewBacktestDetails('${item.strategy}', '${item.timeframe}', '${isShort ? 'short' : 'long'}')" 
                            style="font-size:0.9em; cursor:pointer; background: ${idx === 0 ? 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)' : 'linear-gradient(135deg, #42a5f5 0%, #1976d2 100%)'}; color:white; border:none; padding:8px 30px; border-radius:20px; font-weight:600; box-shadow: 0 4px 10px rgba(0,0,0,0.15); transition: transform 0.2s; display:flex; align-items:center; gap:5px;">
                            Xem Chi Tiết
                         </button>
                    </div>


                </div>
            `;
            targetEl.appendChild(div);
        });
    };

    renderSummary([...aggregatedShort], summaryShort, 'winRate', true);
    renderSummary([...aggregatedLong], summaryLong, 'winRate', false);

    renderSummary([...aggregatedShort], profitShort, 'profit', true);
    renderSummary([...aggregatedLong], profitLong, 'profit', false);

    if (summaryContainer) summaryContainer.style.display = 'block';
    if (profitContainer) profitContainer.style.display = 'block';

    if (summaryContainer) summaryContainer.style.display = 'block';
    if (toggleContainer) toggleContainer.style.display = 'block';

    // 4. Render Full Details
    const color = (val) => val > 0 ? 'green' : (val < 0 ? 'red' : 'black');

    const createSection = (title, aggData, isShort) => {
        if (Object.keys(aggData).length === 0) return;

        const sectionDiv = document.createElement('div');
        sectionDiv.innerHTML = `<h3 style="margin-top:30px; border-bottom:2px solid #ddd; padding-bottom:10px;">${title}</h3>`;

        const tfKeys = Object.keys(aggData).sort((a, b) => parseInt(a) - parseInt(b));

        tfKeys.forEach(tfKey => {
            const tfLabel = Backtester.LABELS[tfKey] || tfKey;
            const rows = aggData[tfKey].sort((a, b) => b.stats.winRate - a.stats.winRate);

            const tableHtml = `
                <div style="margin-top: 15px; margin-bottom: 25px;">
                    <h4 style="margin-bottom: 5px; color: #555;">⏳ ${tfLabel}</h4>
                    <table class="bt-table" style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead style="background: #f8f9fa;">
                            <tr>
                                <th style="padding:8px; text-align:left;">Chiến lược</th>
                                <th style="padding:8px;">Win Rate</th>
                                <th style="padding:8px;">Lợi nhuận TB</th>
                                <th style="padding:8px;">Lời Nhất</th>
                                <th style="padding:8px;">Chi tiết</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((item, index) => {
                const isHighWinRate = item.stats.winRate > 50;
                const isTop1 = index === 0;
                const rowStyle = isHighWinRate
                    ? 'background-color: #e8f5e9; font-weight: bold; border-bottom: 1px solid #c8e6c9;'
                    : 'border-bottom: 1px solid #eee;';
                const winRateStyle = isHighWinRate ? 'color: #2e7d32' : '';

                return `
                                <tr style="${rowStyle}">
                                    <td style="padding:8px;">
                                        ${isTop1 ? '👑 ' : ''}${item.label}
                                    </td>
                                    <td style="padding:8px; text-align:center; ${winRateStyle}">${item.stats.winRate.toFixed(1)}%</td>
                                    <td style="padding:8px; text-align:center; color:${color(item.stats.avgReturn)}">${item.stats.avgReturn.toFixed(2)}%</td>
                                    <td style="padding:8px; text-align:center; color:green;">+${item.stats.maxWin.toFixed(2)}%</td>
                                    <td style="padding:8px; text-align:center;">
                                        <button onclick="viewBacktestDetails('${item.strategy}', '${tfKey}', '${isShort ? 'short' : 'long'}')" 
                                                style="background:#007bff; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.85em;">
                                            Xem
                                        </button>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            sectionDiv.innerHTML += tableHtml;
        });
        fullContainer.appendChild(sectionDiv);
    };

    createSection("Tất Cả Kết Quả - Ngắn Hạn", groupedShort, true);
    createSection("Tất Cả Kết Quả - Dài Hạn", groupedLong, false);
}




window.viewBacktestDetails = function (strategyKey, key, type) {
    if (!allBacktestReports[strategyKey]) return;

    let r;
    if (type === 'signal') r = allBacktestReports[strategyKey].signal;
    else r = allBacktestReports[strategyKey][type][key];

    if (!r) return;

    const label = Backtester.SUPPORTED_STRATEGIES.find(s => s.key === strategyKey).label;

    const tbody = document.getElementById('bt-detail-body');
    const container = document.getElementById('bt-detail-container');
    const title = document.getElementById('bt-detail-title');

    title.style.display = 'block';
    container.style.display = 'block';

    const tfLabel = Backtester.LABELS[key] || key;
    title.innerHTML = `Chi tiết: <span style="color:#007bff">${label}</span> - Khung <span style="color:#e65100">${tfLabel}</span> (${r.count} lệnh)`;

    document.getElementById('bt-max-win').textContent = `+${r.maxWin.toFixed(2)}%`;
    document.getElementById('bt-max-loss').textContent = `${r.maxLoss.toFixed(2)}%`;
    document.getElementById('bt-win-loss-count').textContent = `${r.wins} Lời / ${r.losses} Lỗ`;

    const winRate = r.count > 0 ? (r.wins / r.count * 100) : 0;
    // winRateEl was removed/undefined, skipping color update for now.


    // --- NEW: Current Indicator Value & Conditions ---
    let currentValText = "--";
    let buyCondText = "--";
    let sellCondText = "--";
    let statusColor = "#555";
    let recommendationHtml = "";

    // Safety check for data
    if (analysisData && analysisData.length > 0) {
        const lastIdx = analysisData.length - 1;
        const lastPrice = analysisData[lastIdx].close;
        const lastDate = analysisData[lastIdx].date.toLocaleDateString('vi-VN');

        try {
            switch (strategyKey) {
                case 'rsi':
                    const rsi = Indicators.calculateRSI(analysisData, 14);
                    const currRSI = rsi[lastIdx];
                    currentValText = `RSI(14): <b>${currRSI.toFixed(2)}</b> (Ngày ${lastDate})`;
                    buyCondText = "Mua khi RSI < 30";
                    sellCondText = "Bán khi RSI > 70";

                    if (currRSI < 30) recommendationHtml = "<b style='color:green'>Khu vực MUA (Quá bán)</b>";
                    else if (currRSI > 70) recommendationHtml = "<b style='color:red'>Khu vực BÁN (Quá mua)</b>";
                    else recommendationHtml = "Giữ / Quan sát (Vùng trung tính)";
                    break;
                case 'macd':
                    const macd = Indicators.calculateMACD(analysisData);
                    const m = macd.macd[lastIdx];
                    const s = macd.signal[lastIdx];
                    currentValText = `MACD: <b>${m.toFixed(2)}</b> | Signal: <b>${s.toFixed(2)}</b>`;
                    buyCondText = "MACD cắt lên Signal";
                    sellCondText = "MACD cắt xuống Signal";

                    if (m > s) recommendationHtml = "<b style='color:green'>Xu hướng TĂNG (MACD > Signal)</b>";
                    else recommendationHtml = "<b style='color:red'>Xu hướng GIẢM (MACD < Signal)</b>";
                    break;
                case 'bollinger':
                    const bb = Indicators.calculateBollinger(analysisData, 20, 2);
                    const upper = bb.upper[lastIdx];
                    const lower = bb.lower[lastIdx];
                    currentValText = `Giá: <b>${lastPrice}</b> | Dải dưới: <b>${lower.toFixed(2)}</b>`;
                    buyCondText = "Giá chạm dải dưới";
                    sellCondText = "Giá chạm dải trên";

                    if (lastPrice <= lower * 1.01) recommendationHtml = "<b style='color:green'>Xem xét MUA (Gần dải dưới)</b>";
                    else if (lastPrice >= upper * 0.99) recommendationHtml = "<b style='color:red'>Xem xét BÁN (Gần dải trên)</b>";
                    else recommendationHtml = "Quan sát";
                    break;
                // Add defaults for others to avoid errors
                default:
                    currentValText = "Chưa hỗ trợ hiển thị chi tiết cho chỉ báo này";
            }
        } catch (e) { console.warn("Indicator status calc error", e); }
    }

    let statusDiv = document.getElementById('bt-current-status-box');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'bt-current-status-box';
        statusDiv.style.marginBottom = '20px';
        statusDiv.style.padding = '15px';
        statusDiv.style.borderRadius = '8px';
        statusDiv.style.backgroundColor = '#fff';
        statusDiv.style.border = '1px solid #e0e0e0';
        statusDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

        // Insert at top of container
        container.insertBefore(statusDiv, container.firstChild);
    }

    statusDiv.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
            <div style="background:#f8f9fa; padding:10px; border-radius:5px;">
                <div style="font-size:0.8em; text-transform:uppercase; color:#777; margin-bottom:5px;">📊 Chỉ số Hiện tại</div>
                <div style="font-size:1.1em; color:#333;">${currentValText}</div>
            </div>
            <div style="background:#f8f9fa; padding:10px; border-radius:5px;">
                 <div style="font-size:0.8em; text-transform:uppercase; color:#777; margin-bottom:5px;">💡 Khuyến nghị Hệ thống</div>
                 <div style="font-size:1.1em;">${recommendationHtml || '--'}</div>
            </div>
            <div style="grid-column: 1 / -1; font-size:0.9em; color:#555; border-top:1px solid #eee; padding-top:10px;">
                <strong>Quy tắc:</strong> <span style="color:green">MUA (${buyCondText})</span> - <span style="color:red">BÁN (${sellCondText})</span>
            </div>
        </div>
    `;

    // --- Statistics Analysis (12 Months) ---
    const monthsData = Array(12).fill(0).map(() => ({ count: 0, pnl: 0 }));

    if (r.trades && r.trades.length > 0) {
        r.trades.forEach(t => {
            const dateObj = typeof t.entryDate === 'string' ? new Date(t.entryDate) : t.entryDate;
            const mIdx = dateObj.getMonth(); // 0-11
            monthsData[mIdx].count++;
            monthsData[mIdx].pnl += t.pnl;
        });
    }

    // Find Highlights
    let maxTrades = 0;
    let bestPnL = -Infinity;
    let bestPnLIndex = -1;

    monthsData.forEach((d, i) => {
        if (d.count > maxTrades) maxTrades = d.count;
        if (d.pnl > bestPnL) {
            bestPnL = d.pnl;
            bestPnLIndex = i;
        }
    });

    // Generate 12-Month Table HTML
    // Generate 12-Month Table HTML
    let tableHeader = '<tr style="background:#f8f9fa;"> <th style="padding:10px; text-align:left; border:1px solid #dee2e6; color:#495057;">Tháng</th>';
    let tableRow = '<tr> <td style="padding:10px; font-weight:600; border:1px solid #dee2e6; color:#495057;">Số Lệnh Mua</td>';

    for (let i = 0; i < 12; i++) {
        const d = monthsData[i];
        const monthNum = i + 1;
        const isMostTrades = maxTrades > 0 && d.count === maxTrades;
        const isBestPnL = bestPnLIndex === i && bestPnL > 0;

        let cellStyle = 'padding:10px; text-align:center; border:1px solid #dee2e6; min-width:40px;';

        if (isBestPnL) {
            cellStyle += 'background-color: #c8e6c9; color: #2e7d32; font-weight:bold;'; // Green for Profit (Priority 1)
        } else if (isMostTrades) {
            cellStyle += 'background-color: #e3f2fd; color: #1565c0; font-weight:bold;'; // Blue for Count
        }

        tableHeader += `<th style="padding:10px; text-align:center; border:1px solid #dee2e6; font-size:0.9em; font-weight:600;">T${monthNum}</th>`;
        tableRow += `<td style="${cellStyle}">${d.count}</td>`;
    }

    tableHeader += '</tr>';
    tableRow += '</tr>';


    // Inject Analysis HTML
    let analysisDiv = document.getElementById('bt-detail-analysis');
    if (!analysisDiv) {
        analysisDiv = document.createElement('div');
        analysisDiv.id = 'bt-detail-analysis';
        analysisDiv.style.marginTop = '20px';
        analysisDiv.style.marginBottom = '20px';
        analysisDiv.style.padding = '20px';
        analysisDiv.style.borderRadius = '10px';
        analysisDiv.style.backgroundColor = '#fff';
        analysisDiv.style.border = '1px solid #e0e0e0';
        analysisDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';

        // Insert AFTER the stats dashboard
        const dashboard = document.getElementById('bt-stats-dashboard');
        if (dashboard && dashboard.parentNode) {
            dashboard.parentNode.insertBefore(analysisDiv, dashboard.nextSibling);
        } else {
            // Fallback
            const pieChartEl = document.querySelector("#bt-detail-pie-chart");
            pieChartEl.parentNode.appendChild(analysisDiv);
        }
    }

    analysisDiv.innerHTML = `
        <h4 style="margin: 0 0 20px 0; color:#343a40; font-size:1.1em; border-left:5px solid #007bff; padding-left:15px; text-transform:uppercase; letter-spacing:0.5px;">
            📊 Phân Bổ Lệnh Mua (Buy Orders) Theo Tháng
        </h4>
        
        <div style="margin-bottom:15px; background:#f8f9fa; padding:10px; border-radius:5px; border-left:4px solid #1976d2;">
             <strong>📌 Tháng đặt lệnh nhiều nhất:</strong> Tháng ${monthsData.findIndex(d => d.count === maxTrades) + 1} (${maxTrades} lệnh)
        </div>

        <div style="overflow-x: auto;">
            <table style="width:100%; border-collapse: collapse; font-size:0.95em;">
                ${tableHeader}
                ${tableRow}
            </table>
        </div>
        <div style="margin-top:15px; font-size:0.9em; display:flex; gap:20px; justify-content:flex-end; color:#555;">
            <span style="display:flex; align-items:center; gap:8px;"><span style="width:16px; height:16px; background:#e3f2fd; display:inline-block; border:1px solid #bbdefb; border-radius:3px;"></span> Tháng mua nhiều nhất</span>
            <span style="display:flex; align-items:center; gap:8px;"><span style="width:16px; height:16px; background:#c8e6c9; display:inline-block; border:1px solid #a5d6a7; border-radius:3px;"></span> Tháng lời nhất</span>
        </div>
    `;

    // 6. Win Rate Pie Chart (Existing)
    if (backtestPieChart) backtestPieChart.destroy();
    if (document.querySelector("#bt-detail-pie-chart")) {
        const pieOptions = {
            series: [r.wins, r.losses],
            chart: { type: 'donut', height: 250 },
            labels: ['Lời (Win)', 'Lỗ (Loss)'],
            colors: ['#28a745', '#dc3545'],
            plotOptions: { pie: { donut: { labels: { show: true, total: { show: true, label: 'Win Rate', formatter: () => winRate.toFixed(1) + '%' } } } } },
            dataLabels: { enabled: false },
            legend: { position: 'bottom' },
            title: { text: 'Tỷ lệ Thắng / Thua', align: 'center' }
        };
        backtestPieChart = new ApexCharts(document.querySelector("#bt-detail-pie-chart"), pieOptions);
        backtestPieChart.render();
    }

    // 7. NEW: 12-Month Stacked Bar Chart (Win/Loss)
    // Calculate Monthly Wins/Losses
    const monthlyWins = Array(12).fill(0);
    const monthlyLosses = Array(12).fill(0);

    if (r.trades) {
        r.trades.forEach(t => {
            const d = typeof t.entryDate === 'string' ? new Date(t.entryDate) : t.entryDate;
            if (d instanceof Date && !isNaN(d)) {
                const m = d.getMonth();
                if (t.pnl > 0) monthlyWins[m]++;
                else monthlyLosses[m]++;
            }
        });
    }

    const stackedChartEl = document.querySelector("#bt-month-stacked-chart");
    if (stackedChartEl) {
        // Clear previous if any (using innerHTML for simplicity or store instance globally)
        // Better: store instance globally or property on element
        if (window.monthStackedChart) window.monthStackedChart.destroy();

        const stackedOptions = {
            series: [
                { name: 'Lệnh Lời (Win)', data: monthlyWins },
                { name: 'Lệnh Lỗ (Loss)', data: monthlyLosses }
            ],
            chart: {
                type: 'bar',
                height: 350,
                stacked: true,
                toolbar: { show: false }
            },
            colors: ['#28a745', '#dc3545'],
            plotOptions: {
                bar: { horizontal: false, columnWidth: '55%', borderRadius: 0 }
            },
            dataLabels: { enabled: false }, // Cleaner look
            stroke: { show: true, width: 2, colors: ['transparent'] },
            xaxis: {
                categories: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
                title: { text: 'Tháng' }
            },
            yaxis: {
                title: { text: 'Số Lệnh' },
                stepSize: 1
            },
            fill: { opacity: 1 },
            legend: { position: 'top', horizontalAlign: 'right' },
            title: { text: 'Hiệu Suất Theo Tháng (Thắng/Thua)', align: 'left', style: { fontSize: '16px' } }
        };

        window.monthStackedChart = new ApexCharts(stackedChartEl, stackedOptions);
        window.monthStackedChart.render();
    }
    if (r.trades) {
        tbody.innerHTML = '';
        r.trades.forEach(t => {
            const color = t.pnl > 0 ? 'green' : (t.pnl < 0 ? 'red' : 'black');
            const entryD = new Date(t.entryDate);
            const monthStr = `T${entryD.getMonth() + 1}`;

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #eee';
            tr.innerHTML = `
                <td style="padding:5px; text-align:center; font-weight:bold; color:#555;">${monthStr}</td>
                <td style="padding:5px;">${entryD.toLocaleDateString('vi-VN')}</td>
                <td style="padding:5px; text-align:right;">${t.entryPrice.toLocaleString()}</td>
                <td style="padding:5px;">${t.exitDate ? new Date(t.exitDate).toLocaleDateString('vi-VN') : '-'}</td>
                <td style="padding:5px; text-align:right;">${t.exitPrice ? t.exitPrice.toLocaleString() : '-'}</td>
                <td style="padding:5px; text-align:center;">${t.days}</td>
                <td style="padding:5px; text-align:right; color:${color}; font-weight:bold;">${(t.pnl * 100).toFixed(2)}%</td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Không có dữ liệu chi tiết (Gộp nhóm)</td></tr>';
    }

    container.scrollIntoView({ behavior: 'smooth' });
};


async function runAnalysis() {
    isSectorAnalysis = false;
    const symbol = document.getElementById('analysis-stock-input').value.trim().toUpperCase();
    if (!symbol) {
        alert("Vui lòng nhập mã cổ phiếu hoặc chọn nhóm ngành.");
        return;
    }

    const startStr = document.getElementById('analysis-start-date').value;
    const endStr = document.getElementById('analysis-end-date').value;

    if (!startStr || !endStr) {
        alert("Vui lòng chọn ngày bắt đầu và kết thúc hợp lệ.");
        return;
    }

    const startTs = Math.floor(new Date(startStr).getTime() / 1000);
    const endTs = Math.floor(new Date(endStr).setHours(23, 59, 59) / 1000);

    if (isNaN(startTs) || isNaN(endTs)) {
        alert("Ngày tháng không hợp lệ.");
        return;
    }

    document.getElementById('analyze-btn').textContent = "Đang tải...";
    document.getElementById('analyze-btn').disabled = true;

    try {
        const data = await fetchStockData(symbol, startTs, endTs);
        if (!data || !data.t || data.t.length === 0) {
            alert("Không có dữ liệu.");
            return;
        }

        analysisData = data.t.map((t, i) => ({
            timestamp: t,
            date: new Date(t * 1000),
            open: data.o[i],
            high: data.h[i],
            low: data.l[i],
            close: data.c[i],
            volume: data.v[i]
        }));

        document.getElementById('chart-area-container').style.display = 'block';

        // Render Chart
        renderMainChart(symbol);

        // --- UPDATE HISTORY BOARD ---
        renderHistoryTable(data); // Use rawFetchedData
        renderRealtimeIndicators(data); // NEW: Render Indicators
        document.getElementById('price-history-section').style.display = 'block';

        // Start Polling for Real-time Updates (if today is a trading day)ow.realtimeInterval) clearInterval(window.realtimeInterval);
        // Only poll if end date is recent (e.g., today)
        const isToday = new Date().toDateString() === new Date(endStr).toDateString();
        if (isToday) {
            window.realtimeInterval = setInterval(() => {
                fetchStockData(symbol, startTs, endTs).then(newData => {
                    renderHistoryTable(newData);
                    renderRealtimeIndicators(newData); // NEW: Update Indicators
                    // Optional: Update chart data if needed, but keeping it simple for now
                }).catch(console.error);
            }, 30000);
        }

        updateChartDisplay();

        // Single Stock: Standard Run
        Backtester.SUPPORTED_STRATEGIES.forEach(strat => {
            const report = Backtester.run(analysisData, strat.key);
            allBacktestReports[strat.key] = report;
        });

        await runAdvancedBacktest();
        if (window.setupToggle) window.setupToggle();

    } catch (e) {
        console.error(e);
        alert("Lỗi khi tải dữ liệu: " + (e.message || e));
    } finally {
        document.getElementById('analyze-btn').textContent = "Phân tích";
        document.getElementById('analyze-btn').disabled = false;
    }
}

function renderMainChart(symbol) {
    if (mainChart) mainChart.destroy();
    Object.values(indicatorCharts).forEach(c => c.destroy());
    indicatorCharts = {};
    document.getElementById('indicator-charts-container').innerHTML = '';

    const candlestickSeries = {
        name: 'Price',
        type: 'candlestick',
        data: analysisData.map(d => ({
            x: d.timestamp * 1000, // Safe timestamp for ApexCharts
            y: [d.open, d.high, d.low, d.close]
        }))
    };

    const options = {
        series: [candlestickSeries],
        chart: {
            id: 'main-chart',
            type: 'candlestick',
            height: 550,
            group: 'stock-analysis',
            animations: { enabled: false },
            background: 'transparent',
            fontFamily: 'Segoe UI, sans-serif'
        },
        theme: {
            mode: 'dark',
            palette: 'palette1'
        },
        title: { text: `${symbol} - Technical Analysis` },
        xaxis: { type: 'datetime' },
        yaxis: {
            tooltip: { enabled: true },
            labels: { formatter: val => val ? val.toFixed(2) : val }
        },
        plotOptions: {
            candlestick: {
                colors: { upward: '#28a745', downward: '#dc3545' }
            }
        }
    };

    try {
        mainChart = new ApexCharts(document.querySelector("#main-chart-area"), options);
        mainChart.render();
    } catch (error) {
        console.error("Error drawing chart:", error);
    }
}


function renderHistoryTable(data) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    const count = data.t.length;
    // Show last 30 days max
    const startIndex = Math.max(0, count - 30);

    let html = '';

    // Iterate backwards (Newest top)
    for (let i = count - 1; i >= startIndex; i--) {
        const date = new Date(data.t[i] * 1000);
        const dateStr = date.toLocaleDateString('vi-VN');

        const open = data.o[i];
        const high = data.h[i];
        const low = data.l[i];
        const close = data.c[i];
        const volume = data.v[i];

        let changeStr = "-";
        let changeClass = "trend-ref";
        let percent = 0;

        if (i > 0) {
            const prevClose = data.c[i - 1];
            const change = close - prevClose;
            percent = (change / prevClose) * 100;
            const sign = change > 0 ? "+" : "";

            changeStr = `${sign}${change.toLocaleString()} (${sign}${percent.toFixed(2)}%)`;

            if (change > 0) changeClass = "trend-up";
            else if (change < 0) changeClass = "trend-down";
        }

        // Highlight Today
        const isToday = (i === count - 1); // Assuming last point is today/latest
        const rowClass = isToday ? 'history-row-today' : '';
        const status = isToday ? '<span style="font-size:0.8em; color:red; margin-left:5px;">(Live)</span>' : '';

        html += `
            <tr class="${rowClass}">
                <td>${dateStr} ${status}</td>
                <td>${open.toLocaleString()}</td>
                <td>${high.toLocaleString()}</td>
                <td>${low.toLocaleString()}</td>
                <td style="font-weight:bold;">${close.toLocaleString()}</td>
                <td class="${changeClass}">${changeStr}</td>
                <td>${volume.toLocaleString()}</td>
            </tr>
        `;
    }

    tbody.innerHTML = html;

    const now = new Date();
    document.getElementById('history-last-update').textContent = `Cập nhật: ${now.toLocaleTimeString()}`;
}

function renderRealtimeIndicators(data) {
    const container = document.getElementById('realtime-indicators');
    const recBox = document.getElementById('buy-recommendation');
    const recValue = document.getElementById('rec-price-value');

    if (!container || !data.c || data.c.length < 20) return;

    // Helper: Format Number
    const fmt = (n) => n ? n.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '-';
    // Format Price nicely (no decimals for stocks usually, but 2 for indicators)
    const fmtPrice = (n) => n ? n.toLocaleString('vi-VN') : '-';

    // 1. Calculate Indicators (Using the full dataset)
    const processedData = data.t.map((t, i) => ({
        close: data.c[i], high: data.h[i], low: data.l[i], open: data.o[i], volume: data.v[i]
    }));

    let cardsHtml = '';
    const lastIdx = processedData.length - 1;
    const currentPrice = processedData[lastIdx].close;

    // --- RSI (14) ---
    try {
        const rsi = Indicators.calculateRSI(processedData, 14);
        const currRSI = rsi[lastIdx];
        const color = currRSI > 70 ? '#d32f2f' : (currRSI < 30 ? '#2e7d32' : '#333');
        cardsHtml += `
            <div class="indicator-card">
                <div class="ind-name">RSI (14)</div>
                <div class="ind-value" style="color: ${color}">${fmt(currRSI)}</div>
            </div>`;
    } catch (e) { }

    // --- SMA (20) ---
    let sma20Val = 0;
    try {
        const sma = Indicators.calculateSMA(processedData, 20);
        sma20Val = sma[lastIdx];
        const color = currentPrice > sma20Val ? '#2e7d32' : '#d32f2f';
        cardsHtml += `
            <div class="indicator-card">
                <div class="ind-name">SMA (20)</div>
                <div class="ind-value" style="color: ${color}">${fmtPrice(sma20Val)}</div>
            </div>`;
    } catch (e) { }

    // --- MACD ---
    try {
        const macd = Indicators.calculateMACD(processedData);
        const currMacd = macd.macd[lastIdx];
        const color = currMacd > macd.signal[lastIdx] ? '#2e7d32' : '#d32f2f';
        cardsHtml += `
            <div class="indicator-card">
                <div class="ind-name">MACD</div>
                <div class="ind-value" style="color: ${color}">${fmt(currMacd)}</div>
            </div>`;
    } catch (e) { }

    // --- Bollinger Bands (20, 2) ---
    let lowerBB = 0;
    try {
        const bb = Indicators.calculateBollinger(processedData, 20, 2);
        lowerBB = bb.lower[lastIdx];
        const diff = ((currentPrice - lowerBB) / lowerBB) * 100;
        // If close to lower band (< 2%), color green
        const color = diff < 2 ? '#2e7d32' : '#333';
        cardsHtml += `
            <div class="indicator-card">
                <div class="ind-name">Lower BB</div>
                <div class="ind-value" style="color: ${color}">${fmtPrice(lowerBB)}</div>
            </div>`;
    } catch (e) { }

    container.innerHTML = cardsHtml;

    // 2. Buy Recommendation Logic
    // Strategy: Recommend picking up at Strong Support
    // Support 1: SMA 20 (Trend Support)
    // Support 2: Lower Bollinger Band (Volatility Mean Reversion)
    // Logic: If Uptrend (Price > SMA50), recommend SMA20. If Sideway/Down, recommend Lower BB.

    // Simple Recommendation: MAX(SMA20, LowerBB) if Price > SMA20 (Dip Buying)
    // Or just LowerBB if Price is low.

    let buyTarget = lowerBB;
    if (sma20Val > lowerBB && currentPrice > sma20Val) {
        // Strong uptrend, SMA20 is the dynamic support
        buyTarget = sma20Val;
    }

    if (buyTarget > 0) {
        recBox.style.display = 'flex';
        recValue.innerHTML = `${fmtPrice(buyTarget)} <span style="font-size:0.6em; color:#777; font-weight:normal;">(±1%)</span>`;
    } else {
        recBox.style.display = 'none'; // Not enough data
    }
}


function updateChartDisplay() {
    if (!mainChart || analysisData.length === 0) return;


    // Check toggles
    const toggles = {};
    document.querySelectorAll('.indicator-toggle').forEach(chk => {
        toggles[chk.dataset.indicator] = chk.checked;
    });

    const newSeries = [{
        name: 'Price',
        type: 'candlestick',
        data: analysisData.map(d => ({ x: d.date, y: [d.open, d.high, d.low, d.close] }))
    }];

    // SMA
    if (toggles['sma']) {
        const smaData = Indicators.calculateSMA(analysisData, 20);
        newSeries.push({
            name: 'SMA 20',
            type: 'line',
            data: smaData.map((v, i) => ({ x: analysisData[i].date, y: v }))
        });
    }

    // EMA
    if (toggles['ema']) {
        const emaData = Indicators.calculateEMA(analysisData, 20);
        newSeries.push({
            name: 'EMA 20',
            type: 'line',
            data: emaData.map((v, i) => ({ x: analysisData[i].date, y: v }))
        });
    }

    // Bollinger
    if (toggles['bollinger']) {
        const bb = Indicators.calculateBollinger(analysisData, 20, 2);
        newSeries.push({ name: 'BB Upper', type: 'line', data: bb.upper.map((v, i) => ({ x: analysisData[i].date, y: v })) });
        newSeries.push({ name: 'BB Lower', type: 'line', data: bb.lower.map((v, i) => ({ x: analysisData[i].date, y: v })) });
    }

    // Ichimoku
    if (toggles['ichimoku']) {
        const ichi = Indicators.calculateIchimoku(analysisData);
        newSeries.push({ name: 'Tenkan', type: 'line', data: ichi.tenkan.map((v, i) => ({ x: analysisData[i].date, y: v })) });
        newSeries.push({ name: 'Kijun', type: 'line', data: ichi.kijun.map((v, i) => ({ x: analysisData[i].date, y: v })) });
        newSeries.push({ name: 'Span A', type: 'line', data: ichi.spanA.map((v, i) => ({ x: analysisData[i].date, y: v })) });
        newSeries.push({ name: 'Span B', type: 'line', data: ichi.spanB.map((v, i) => ({ x: analysisData[i].date, y: v })) });
        newSeries.push({ name: 'Lagging', type: 'line', data: ichi.lagging.map((v, i) => ({ x: analysisData[i].date, y: v })) });
    }

    mainChart.updateSeries(newSeries);

    // Annotations
    mainChart.clearAnnotations();
    if (toggles['fibonacci']) {
        const fib = Indicators.calculateFibonacci(analysisData);
        if (fib) {
            fib.levels.forEach(l => {
                mainChart.addYaxisAnnotation({
                    y: l.price,
                    borderColor: '#775DD0',
                    label: { text: l.text, style: { color: '#fff', background: '#775DD0' } }
                });
            });
        }
    }

    const container = document.getElementById('indicator-charts-container');

    const ensureChart = (id, height, title) => {
        if (!document.getElementById(id)) {
            const div = document.createElement('div');
            div.id = id;
            div.className = 'indicator-chart';
            div.style.marginTop = '20px';
            container.appendChild(div);

            const options = {
                series: [],
                chart: {
                    id: id,
                    type: 'line',
                    height: height,
                    group: 'stock-analysis',
                    animations: { enabled: false },
                    background: 'transparent',
                    fontFamily: 'Segoe UI, sans-serif'
                },
                theme: { mode: 'dark' },
                title: { text: title, align: 'left', style: { fontSize: "14px" } },
                xaxis: { type: 'datetime' },
                yaxis: { labels: { formatter: val => val ? val.toFixed(2) : val } }
            };
            const chart = new ApexCharts(div, options);
            chart.render();
            indicatorCharts[id] = chart;
            return chart;
        }
        return indicatorCharts[id];
    };

    const removeChart = (id) => {
        if (indicatorCharts[id]) {
            indicatorCharts[id].destroy();
            delete indicatorCharts[id];
            const div = document.getElementById(id);
            if (div) div.remove();
        }
    };

    // RSI
    if (toggles['rsi']) {
        const rsiData = Indicators.calculateRSI(analysisData, 14);
        const chart = ensureChart('chart-rsi', 200, 'RSI (14)');
        chart.updateSeries([{ name: 'RSI', data: rsiData.map((v, i) => ({ x: analysisData[i].date, y: v })) }]);
        chart.updateOptions({
            annotations: {
                yaxis: [
                    { y: 30, borderColor: '#FF4560', label: { text: '30' } },
                    { y: 70, borderColor: '#FF4560', label: { text: '70' } }
                ]
            }
        });
    } else {
        removeChart('chart-rsi');
    }

    // MACD
    if (toggles['macd']) {
        const macd = Indicators.calculateMACD(analysisData);
        const chart = ensureChart('chart-macd', 250, 'MACD (12, 26, 9)');
        chart.updateSeries([
            { name: 'MACD', type: 'line', data: macd.macd.map((v, i) => ({ x: analysisData[i].date, y: v })) },
            { name: 'Signal', type: 'line', data: macd.signal.map((v, i) => ({ x: analysisData[i].date, y: v })) },
            { name: 'Histogram', type: 'bar', data: macd.histogram.map((v, i) => ({ x: analysisData[i].date, y: v })) }
        ]);
    } else {
        removeChart('chart-macd');
    }

    // Stochastic
    if (toggles['stochastic']) {
        const stoch = Indicators.calculateStochastic(analysisData);
        const chart = ensureChart('chart-stoch', 200, 'Stochastic (14, 3, 3)');
        chart.updateSeries([
            { name: '%K', data: stoch.k.map((v, i) => ({ x: analysisData[i].date, y: v })) },
            { name: '%D', data: stoch.d.map((v, i) => ({ x: analysisData[i].date, y: v })) }
        ]);
        chart.updateOptions({
            annotations: {
                yaxis: [
                    { y: 20, borderColor: '#00D9E9' },
                    { y: 80, borderColor: '#00D9E9' }
                ]
            }
        });
    } else {
        removeChart('chart-stoch');
    }

    // StdDev
    if (toggles['stddev']) {
        const std = Indicators.calculateStdDev(analysisData, 20);
        const chart = ensureChart('chart-stddev', 200, 'Standard Deviation (20)');
        chart.updateSeries([{ name: 'StdDev', data: std.map((v, i) => ({ x: analysisData[i].date, y: v })) }]);
    } else {
        removeChart('chart-stddev');
    }

    // ADX
    if (toggles['adx']) {
        const adxRes = Indicators.calculateADX(analysisData, 14);
        const chart = ensureChart('chart-adx', 250, 'ADX (14)');
        chart.updateSeries([
            { name: 'ADX', data: adxRes.adx.map((v, i) => ({ x: analysisData[i].date, y: v })) },
            { name: '+DI', data: adxRes.diPlus.map((v, i) => ({ x: analysisData[i].date, y: v })) },
            { name: '-DI', data: adxRes.diMinus.map((v, i) => ({ x: analysisData[i].date, y: v })) }
        ]);
    } else {
        removeChart('chart-adx');
    }
}

// Ensure init is called
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnalysis);
} else {
    initAnalysis();
}

// Toggle Handler Re-Init
window.setupToggle = function () {
    const toggleBtn = document.getElementById('bt-toggle-btn');
    const fullContainer = document.getElementById('bt-comparison-container');

    if (toggleBtn && fullContainer) {
        if (toggleBtn.getAttribute('data-init') === 'true') return;

        toggleBtn.addEventListener('click', () => {
            if (fullContainer.style.display === 'none') {
                fullContainer.style.display = 'block';
                toggleBtn.textContent = '⬆️ Thu Gọn Kết Quả';
            } else {
                fullContainer.style.display = 'none';
                toggleBtn.textContent = '⬇️ Xem Tất Cả Kết Quả Chi Tiết (Bảng Đầy Đủ)';
            }
        });
        toggleBtn.setAttribute('data-init', 'true');
    }
};

// ============================================================
// ENHANCED RECOMMENDATION SYSTEM
// ============================================================

// Global storage for news
let allNewsItems = [];

// Strategy configuration for buy/sell zone calculation
const STRATEGY_CONFIG = {
    rsi: {
        name: 'RSI (14)',
        buyCondition: 'RSI < 30 (Quá bán)',
        sellCondition: 'RSI > 70 (Quá mua)',
        calculateBuyZone: (data) => {
            const rsi = Indicators.calculateRSI(data, 14);
            const lastIdx = data.length - 1;
            const currentRSI = rsi[lastIdx];
            const currentPrice = data[lastIdx].close;

            // Find recent low RSI points
            let targetPrice = currentPrice;
            for (let i = lastIdx; i >= Math.max(0, lastIdx - 30); i--) {
                if (rsi[i] < 35) {
                    targetPrice = data[i].close;
                    break;
                }
            }

            // If RSI is low, buy zone is current price
            if (currentRSI < 35) {
                targetPrice = currentPrice;
            }

            return {
                idealPrice: targetPrice,
                rangeMin: targetPrice * 0.98,
                rangeMax: targetPrice * 1.02,
                condition: `Mua khi RSI giảm xuống dưới 30 và bắt đầu hồi lên`,
                currentValue: currentRSI
            };
        },
        calculateSellZone: (data, buyPrice) => {
            const rsi = Indicators.calculateRSI(data, 14);
            const lastIdx = data.length - 1;
            const currentPrice = data[lastIdx].close;

            // Target when RSI reaches overbought
            const targetPrice = buyPrice * 1.08; // 8% profit target
            const stopLoss = buyPrice * 0.95; // 5% stop loss

            return {
                targetPrice: targetPrice,
                stopLoss: stopLoss,
                riskReward: Math.abs(targetPrice - buyPrice) / Math.abs(buyPrice - stopLoss),
                condition: `Bán khi RSI vượt 70 hoặc giá đạt mục tiêu`
            };
        }
    },
    macd: {
        name: 'MACD (12,26,9)',
        buyCondition: 'MACD cắt lên Signal',
        sellCondition: 'MACD cắt xuống Signal',
        calculateBuyZone: (data) => {
            const macd = Indicators.calculateMACD(data);
            const lastIdx = data.length - 1;
            const currentPrice = data[lastIdx].close;

            // Find recent MACD crossover points
            let targetPrice = currentPrice;
            for (let i = lastIdx; i >= Math.max(0, lastIdx - 20); i--) {
                if (i > 0 && macd.macd[i] > macd.signal[i] && macd.macd[i - 1] <= macd.signal[i - 1]) {
                    targetPrice = data[i].close;
                    break;
                }
            }

            return {
                idealPrice: targetPrice,
                rangeMin: targetPrice * 0.97,
                rangeMax: targetPrice * 1.03,
                condition: `Mua khi MACD cắt lên trên Signal (đặc biệt dưới đường 0)`,
                currentValue: macd.macd[lastIdx] - macd.signal[lastIdx]
            };
        },
        calculateSellZone: (data, buyPrice) => {
            const targetPrice = buyPrice * 1.10; // 10% profit
            const stopLoss = buyPrice * 0.94; // 6% stop loss

            return {
                targetPrice: targetPrice,
                stopLoss: stopLoss,
                riskReward: Math.abs(targetPrice - buyPrice) / Math.abs(buyPrice - stopLoss),
                condition: `Bán khi MACD cắt xuống Signal hoặc đạt mục tiêu`
            };
        }
    },
    bollinger: {
        name: 'Bollinger Bands (20,2)',
        buyCondition: 'Giá chạm Lower Band',
        sellCondition: 'Giá chạm Upper Band',
        calculateBuyZone: (data) => {
            const bb = Indicators.calculateBollinger(data, 20, 2);
            const lastIdx = data.length - 1;
            const lowerBB = bb.lower[lastIdx];
            const middleBB = bb.middle[lastIdx];

            return {
                idealPrice: lowerBB,
                rangeMin: lowerBB * 0.99,
                rangeMax: lowerBB * 1.01,
                condition: `Mua khi giá chạm hoặc xuyên thủng dải dưới Bollinger`,
                currentValue: lowerBB
            };
        },
        calculateSellZone: (data, buyPrice) => {
            const bb = Indicators.calculateBollinger(data, 20, 2);
            const lastIdx = data.length - 1;
            const upperBB = bb.upper[lastIdx];
            const middleBB = bb.middle[lastIdx];

            const targetPrice = middleBB; // Conservative: middle band
            const stopLoss = buyPrice * 0.95;

            return {
                targetPrice: upperBB,
                stopLoss: stopLoss,
                riskReward: Math.abs(upperBB - buyPrice) / Math.abs(buyPrice - stopLoss),
                condition: `Bán khi giá chạm dải trên hoặc dải giữa`
            };
        }
    },
    sma: {
        name: 'SMA (20/50)',
        buyCondition: 'Golden Cross hoặc pullback về SMA',
        sellCondition: 'Death Cross hoặc phá SMA',
        calculateBuyZone: (data) => {
            const sma20 = Indicators.calculateSMA(data, 20);
            const sma50 = Indicators.calculateSMA(data, 50);
            const lastIdx = data.length - 1;
            const currentPrice = data[lastIdx].close;

            // If uptrend, buy zone is SMA20
            let targetPrice = sma20[lastIdx];
            if (currentPrice > sma20[lastIdx]) {
                targetPrice = sma20[lastIdx]; // pullback target
            }

            return {
                idealPrice: targetPrice,
                rangeMin: targetPrice * 0.98,
                rangeMax: targetPrice * 1.02,
                condition: `Mua khi giá pullback về SMA20 trong uptrend`,
                currentValue: sma20[lastIdx]
            };
        },
        calculateSellZone: (data, buyPrice) => {
            const sma20 = Indicators.calculateSMA(data, 20);
            const lastIdx = data.length - 1;

            const targetPrice = buyPrice * 1.12; // 12% target
            const stopLoss = sma20[lastIdx] * 0.97; // Below SMA20

            return {
                targetPrice: targetPrice,
                stopLoss: stopLoss,
                riskReward: Math.abs(targetPrice - buyPrice) / Math.abs(buyPrice - stopLoss),
                condition: `Bán khi giá phá xuống SMA20 hoặc đạt mục tiêu`
            };
        }
    },
    ichimoku: {
        name: 'Ichimoku Cloud',
        buyCondition: 'Giá vượt mây + TK Cross',
        sellCondition: 'Giá vào mây hoặc TK Death Cross',
        calculateBuyZone: (data) => {
            const ichi = Indicators.calculateIchimoku(data);
            const lastIdx = data.length - 1;
            const currentPrice = data[lastIdx].close;

            const cloudBottom = Math.min(ichi.spanA[lastIdx], ichi.spanB[lastIdx]);
            const cloudTop = Math.max(ichi.spanA[lastIdx], ichi.spanB[lastIdx]);

            // Buy zone is cloud top (support in uptrend)
            let targetPrice = cloudTop;
            if (currentPrice < cloudBottom) {
                targetPrice = cloudBottom * 0.98;
            }

            return {
                idealPrice: targetPrice,
                rangeMin: targetPrice * 0.98,
                rangeMax: targetPrice * 1.02,
                condition: `Mua khi giá vượt mây và Tenkan cắt lên Kijun`,
                currentValue: cloudTop
            };
        },
        calculateSellZone: (data, buyPrice) => {
            const ichi = Indicators.calculateIchimoku(data);
            const lastIdx = data.length - 1;

            const targetPrice = buyPrice * 1.15; // 15% for Ichimoku
            const stopLoss = ichi.kijun[lastIdx] * 0.98;

            return {
                targetPrice: targetPrice,
                stopLoss: stopLoss,
                riskReward: Math.abs(targetPrice - buyPrice) / Math.abs(buyPrice - stopLoss),
                condition: `Bán khi giá rơi vào mây hoặc Tenkan cắt xuống Kijun`
            };
        }
    },
    adx: {
        name: 'ADX (14)',
        buyCondition: '+DI > -DI và ADX > 25',
        sellCondition: '-DI > +DI hoặc ADX gục đầu',
        calculateBuyZone: (data) => {
            const adx = Indicators.calculateADX(data, 14);
            const lastIdx = data.length - 1;
            const currentPrice = data[lastIdx].close;

            // Find entry point when trend starts
            let targetPrice = currentPrice;
            for (let i = lastIdx; i >= Math.max(0, lastIdx - 20); i--) {
                if (adx.diPlus[i] > adx.diMinus[i] && adx.adx[i] > 25) {
                    targetPrice = data[i].close;
                    break;
                }
            }

            return {
                idealPrice: targetPrice,
                rangeMin: targetPrice * 0.97,
                rangeMax: targetPrice * 1.03,
                condition: `Mua khi +DI cắt lên -DI và ADX > 25`,
                currentValue: adx.adx[lastIdx]
            };
        },
        calculateSellZone: (data, buyPrice) => {
            const targetPrice = buyPrice * 1.12;
            const stopLoss = buyPrice * 0.94;

            return {
                targetPrice: targetPrice,
                stopLoss: stopLoss,
                riskReward: Math.abs(targetPrice - buyPrice) / Math.abs(buyPrice - stopLoss),
                condition: `Bán khi -DI cắt lên +DI hoặc ADX gục đầu từ mức cao`
            };
        }
    }
};

// Get top strategy from backtest results
function getTopStrategy() {
    if (Object.keys(allBacktestReports).length === 0) return null;

    let bestStrategy = null;
    let bestWinRate = 0;
    let bestTimeframe = null;
    let bestStats = null;

    Object.keys(allBacktestReports).forEach(stratKey => {
        const report = allBacktestReports[stratKey];

        // Check both short and long timeframes
        ['short', 'long'].forEach(type => {
            if (report[type]) {
                Object.keys(report[type]).forEach(tf => {
                    const r = report[type][tf];
                    const winRate = r.count > 0 ? (r.wins / r.count * 100) : 0;

                    if (winRate > bestWinRate && r.count >= 3) { // At least 3 trades
                        bestWinRate = winRate;
                        bestStrategy = stratKey;
                        bestTimeframe = tf;
                        bestStats = {
                            winRate: winRate,
                            avgReturn: r.avgReturn || 0,
                            trades: r.count,
                            wins: r.wins,
                            totalReturn: (r.avgReturn || 0) * (r.count || 0)
                        };
                    }
                });
            }
        });
    });

    return bestStrategy ? { key: bestStrategy, stats: bestStats, timeframe: bestTimeframe } : null;
}

// Generate action plan based on strategy
function generateActionPlan(strategyKey, buyZone, sellZone, currentPrice) {
    const config = STRATEGY_CONFIG[strategyKey];
    const fmtPrice = (p) => p ? p.toLocaleString('vi-VN') : '--';

    const plans = {
        step1: '',
        step2: '',
        step3: '',
        step4: ''
    };

    // Step 1: Entry condition
    plans.step1 = `Chờ ${config.buyCondition}. Giá hiện tại: ${fmtPrice(currentPrice)}. Vùng mua lý tưởng: ${fmtPrice(buyZone.idealPrice)}`;

    // Step 2: Position sizing
    const distance = Math.abs(currentPrice - buyZone.idealPrice) / buyZone.idealPrice * 100;
    if (distance < 2) {
        plans.step2 = `Giá đang gần vùng mua (cách ${distance.toFixed(1)}%). Chia làm 3 đợt: 40% - 30% - 30%`;
    } else {
        plans.step2 = `Giá còn cách vùng mua ${distance.toFixed(1)}%. Đặt limit order tại ${fmtPrice(buyZone.idealPrice)}. Chia 2 đợt: 50% - 50%`;
    }

    // Step 3: Take profit
    const profitPercent = ((sellZone.targetPrice - buyZone.idealPrice) / buyZone.idealPrice * 100).toFixed(1);
    plans.step3 = `Chốt lời tại ${fmtPrice(sellZone.targetPrice)} (Lợi nhuận kỳ vọng: +${profitPercent}%). Điều kiện: ${sellZone.condition}`;

    // Step 4: Stop loss
    const lossPercent = ((sellZone.stopLoss - buyZone.idealPrice) / buyZone.idealPrice * 100).toFixed(1);
    plans.step4 = `Cắt lỗ tại ${fmtPrice(sellZone.stopLoss)} (${lossPercent}%). R:R = 1:${sellZone.riskReward.toFixed(1)}. Không để mất quá 5% vốn.`;

    return plans;
}

// Render enhanced recommendation section
function renderEnhancedRecommendation() {
    const section = document.getElementById('enhanced-recommendation-section');
    const newsSection = document.getElementById('stock-news-section');

    if (!section || analysisData.length === 0) return;

    const topStrategy = getTopStrategy();
    if (!topStrategy) {
        section.style.display = 'none';
        return;
    }

    const config = STRATEGY_CONFIG[topStrategy.key];
    if (!config) {
        section.style.display = 'none';
        return;
    }

    const currentPrice = analysisData[analysisData.length - 1].close;
    const buyZone = config.calculateBuyZone(analysisData);
    const sellZone = config.calculateSellZone(analysisData, buyZone.idealPrice);
    const actionPlan = generateActionPlan(topStrategy.key, buyZone, sellZone, currentPrice);

    const fmtPrice = (p) => p ? p.toLocaleString('vi-VN') : '--';

    // Update UI elements
    document.getElementById('top-strategy-name').textContent = config.name;
    document.getElementById('top-strategy-winrate').textContent = `${topStrategy.stats.winRate.toFixed(1)}% Win`;

    // Buy Zone
    document.getElementById('buy-zone-price').textContent = fmtPrice(buyZone.idealPrice);
    document.getElementById('buy-zone-range').textContent = `Vùng an toàn: ${fmtPrice(buyZone.rangeMin)} - ${fmtPrice(buyZone.rangeMax)}`;
    document.getElementById('buy-zone-condition').innerHTML = `<strong>Điều kiện:</strong> ${buyZone.condition}`;

    // Sell Zone
    document.getElementById('sell-zone-price').textContent = fmtPrice(sellZone.targetPrice);
    document.getElementById('sell-zone-range').innerHTML = `
        <span style="color:#4caf50;">Take Profit: ${fmtPrice(sellZone.targetPrice)}</span> | 
        <span style="color:#f44336;">Stop Loss: ${fmtPrice(sellZone.stopLoss)}</span>
    `;
    document.getElementById('sell-zone-condition').innerHTML = `<strong>Điều kiện:</strong> ${sellZone.condition}`;

    // Metrics
    document.getElementById('metric-winrate').textContent = `${topStrategy.stats.winRate.toFixed(1)}%`;
    document.getElementById('metric-avg-return').textContent = `${topStrategy.stats.avgReturn >= 0 ? '+' : ''}${(topStrategy.stats.avgReturn * 100).toFixed(1)}%`;
    document.getElementById('metric-risk-reward').textContent = `1:${sellZone.riskReward.toFixed(1)}`;
    document.getElementById('metric-trades').textContent = topStrategy.stats.trades;

    // --- NEW: Calculate Best Buying Month ---
    let bestMonthText = "--";
    const report = allBacktestReports[topStrategy.key];
    const targetReport = report[topStrategy.timeframe] || report['short'] || report['long']; // Fallback

    if (targetReport && targetReport.trades && targetReport.trades.length > 0) {
        // Calculate monthly stats
        const monthStats = Array(12).fill(0).map(() => ({ count: 0, totalPnL: 0, wins: 0 }));

        targetReport.trades.forEach(t => {
            const entryDate = typeof t.entryDate === 'string' ? new Date(t.entryDate) : t.entryDate;
            if (entryDate instanceof Date && !isNaN(entryDate)) {
                const m = entryDate.getMonth(); // 0-11
                monthStats[m].count++;
                monthStats[m].totalPnL += t.pnl;
                if (t.pnl > 0) monthStats[m].wins++;
            }
        });

        // Score months: (WinRate * 0.4) + (AvgPnL * 0.4) + (Frequency * 0.2)
        // Simple logic: Highest Avg Return with at least 1 trade
        let bestScore = -Infinity;
        let bestMonthIndex = -1;

        monthStats.forEach((stat, m) => {
            if (stat.count > 0) {
                const winRate = stat.wins / stat.count;
                const avgPnL = stat.totalPnL / stat.count;
                // Score heuristic
                const score = (winRate * 50) + (avgPnL * 100 * 5);

                if (score > bestScore) {
                    bestScore = score;
                    bestMonthIndex = m;
                }
            }
        });

        if (bestMonthIndex !== -1) {
            bestMonthText = `Tháng ${bestMonthIndex + 1}`;
        }
    }

    const bestMonthEl = document.getElementById('metric-best-month');
    if (bestMonthEl) bestMonthEl.textContent = bestMonthText;


    // Action Plan
    document.getElementById('step-1-detail').textContent = actionPlan.step1;
    document.getElementById('step-2-detail').textContent = actionPlan.step2;
    document.getElementById('step-3-detail').textContent = actionPlan.step3;
    document.getElementById('step-4-detail').textContent = actionPlan.step4;

    section.style.display = 'block';

    // Fetch and show news
    const symbol = document.getElementById('analysis-stock-input').value.trim().toUpperCase();
    if (symbol) {
        fetchAllNews(symbol);
        if (newsSection) {
            document.getElementById('news-stock-symbol').textContent = symbol;
            newsSection.style.display = 'block';
        }
    }
}

// ============================================================
// NEWS API INTEGRATION
// ============================================================

// Fetch news from multiple sources
async function fetchAllNews(symbol) {
    const newsList = document.getElementById('news-list');
    if (!newsList) return;

    newsList.innerHTML = '<div class="news-loading">⏳ Đang tải tin tức...</div>';
    allNewsItems = [];

    try {
        // Fetch from multiple sources concurrently
        const results = await Promise.allSettled([
            fetchVNDirectNews(symbol),
            fetchFireAntNews(symbol),
            fetchCafeFNews(symbol)
        ]);

        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                allNewsItems = allNewsItems.concat(result.value);
            }
        });

        // Sort by date (newest first)
        allNewsItems.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Take top 10
        allNewsItems = allNewsItems.slice(0, 10);

        renderNews(allNewsItems);

    } catch (error) {
        console.error('Error fetching news:', error);
        newsList.innerHTML = '<div class="news-loading">❌ Không thể tải tin tức. Vui lòng thử lại sau.</div>';
    }
}

// VNDirect News API
async function fetchVNDirectNews(symbol) {
    try {
        const url = `https://finfo-api.vndirect.com.vn/v4/news?q=code:${symbol}&size=5&sort=newsDate:desc`;
        const response = await fetch(url);
        if (!response.ok) return [];

        const data = await response.json();
        if (!data.data) return [];

        return data.data.map(item => ({
            title: item.newsTitle || item.title,
            date: item.newsDate || item.publishDate,
            source: 'vndirect',
            type: 'stock',
            summary: item.newsContent ? item.newsContent.substring(0, 150) + '...' : '',
            url: item.newsUrl || '#'
        }));
    } catch (e) {
        console.warn('VNDirect news fetch failed:', e);
        return [];
    }
}

// FireAnt News API
async function fetchFireAntNews(symbol) {
    try {
        const url = `https://restv2.fireant.vn/posts?symbol=${symbol}&type=1&offset=0&limit=5`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!response.ok) return [];

        const data = await response.json();
        if (!Array.isArray(data)) return [];

        return data.slice(0, 5).map(item => ({
            title: item.title || item.content?.substring(0, 100) || 'Cập nhật từ FireAnt',
            date: item.date || item.createdDate,
            source: 'fireant',
            type: item.type === 2 ? 'internal' : 'stock',
            summary: item.content ? item.content.substring(0, 150) + '...' : '',
            url: `https://fireant.vn/cong-dong/bai-viet/${item.postID}` || '#'
        }));
    } catch (e) {
        console.warn('FireAnt news fetch failed:', e);
        return [];
    }
}

// CafeF News API (scraping alternative content)
async function fetchCafeFNews(symbol) {
    try {
        // Get sector news via VNDirect sector endpoint
        const sectorUrl = `https://finfo-api.vndirect.com.vn/v4/news?q=tag:market&size=5&sort=newsDate:desc`;
        const response = await fetch(sectorUrl);
        if (!response.ok) return [];

        const data = await response.json();
        if (!data.data) return [];

        return data.data.slice(0, 3).map(item => ({
            title: item.newsTitle || item.title,
            date: item.newsDate || item.publishDate,
            source: 'cafef',
            type: 'sector',
            summary: item.newsContent ? item.newsContent.substring(0, 150) + '...' : '',
            url: item.newsUrl || '#'
        }));
    } catch (e) {
        console.warn('CafeF/Sector news fetch failed:', e);
        return [];
    }
}

// Render news items
function renderNews(items) {
    const newsList = document.getElementById('news-list');
    if (!newsList) return;

    if (items.length === 0) {
        newsList.innerHTML = '<div class="news-loading">📭 Không tìm thấy tin tức cho mã này.</div>';
        return;
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getTypeTag = (type) => {
        switch (type) {
            case 'stock': return '<span class="news-type-tag stock">Cổ phiếu</span>';
            case 'sector': return '<span class="news-type-tag sector">Ngành</span>';
            case 'internal': return '<span class="news-type-tag internal">Nội bộ</span>';
            default: return '';
        }
    };

    newsList.innerHTML = items.map(item => `
        <div class="news-item" data-type="${item.type}" onclick="window.open('${item.url}', '_blank')">
            <div class="news-meta">
                <div>
                    <span class="news-source ${item.source}">${item.source.toUpperCase()}</span>
                    ${getTypeTag(item.type)}
                </div>
                <span class="news-date">${formatDate(item.date)}</span>
            </div>
            <div class="news-title">${item.title}</div>
            ${item.summary ? `<div class="news-summary">${item.summary}</div>` : ''}
        </div>
    `).join('');
}

// Filter news by type
window.filterNews = function (type) {
    // Update active tab
    document.querySelectorAll('.news-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.type === type) {
            tab.classList.add('active');
        }
    });

    // Filter and render
    if (type === 'all') {
        renderNews(allNewsItems);
    } else {
        const filtered = allNewsItems.filter(item => item.type === type);
        renderNews(filtered);
    }
};

// Hook into the existing runAdvancedBacktest to trigger enhanced recommendation
const originalRunAdvancedBacktest = runAdvancedBacktest;
runAdvancedBacktest = async function () {
    await originalRunAdvancedBacktest.apply(this, arguments);

    // Render enhanced recommendation after backtest completes
    setTimeout(() => {
        renderEnhancedRecommendation();
    }, 500);
};
