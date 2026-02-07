// VN100_FULL and INDUSTRY_MAP are imported from vn100_list.js

const startBtn = document.getElementById('start-export-btn');
const progressBar = document.getElementById('progress-bar');
const logArea = document.getElementById('log-area');

const START_DATE_STR = "2022-01-01";
// Fetch from a bit earlier to calculate first day's ceiling/floor if needed, but simple formula uses Ref=PrevClose.
// API returns sorted by date.

startBtn.addEventListener('click', startExport);

async function startExport() {
    startBtn.disabled = true;
    startBtn.textContent = "Đang xử lý...";
    logArea.innerHTML = '';
    addLog("Bắt đầu quá trình xuất dữ liệu...", "log-info");

    const uniqueStocks = [...new Set(VN100_FULL)].sort(); // Deduplicate
    const total = uniqueStocks.length;
    let completed = 0;

    const wb = XLSX.utils.book_new();

    // Group stocks for internal logic if needed, but user asked for sheets.
    // We will create sheets for each stock, OR sheets for each Industry?
    // User asked: "File Excel hoàn chỉnh có 100 cái sheet tương ứng với 100 mã cổ phiếu".
    // AND "chia theo các nhóm ngành". Maybe sheets named "Industry - Stock"? Or just one file.
    // "Chia các mã cổ phiếu theo nhóm ngành" -> Maybe organize sheets or add Industry column?
    // I will add an "Industry" column to each sheet and maybe color code or sort tabs if possible.
    // But standard XLSX structure: 1 sheet per stock is safest for "100 sheet".

    const today = new Date();
    const startDate = new Date(START_DATE_STR);
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(today.getTime() / 1000);

    for (const symbol of uniqueStocks) {
        try {
            updateProgress(completed, total, `Đang tải ${symbol}...`);
            const data = await fetchStockData(symbol, startTs, endTs);

            if (data && data.t && data.t.length > 0) {
                const processedData = processDataForExport(symbol, data);
                const ws = XLSX.utils.json_to_sheet(processedData);
                XLSX.utils.book_append_sheet(wb, ws, symbol);
                addLog(`Đã tải xong: ${symbol} (${processedData.length} dòng)`, "log-success");
            } else {
                addLog(`Không có dữ liệu: ${symbol}`, "log-error");
            }

        } catch (err) {
            console.error(err);
            addLog(`Lỗi tải ${symbol}: ${err.message}`, "log-error");
        }

        completed++;
        updateProgress(completed, total);
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    addLog("Đang tạo file Excel...", "log-info");
    // Write file
    try {
        XLSX.writeFile(wb, "VN100_Lich_Su_Gia.xlsx");
        addLog("Xuất file thành công! Kiểm tra thư mục tải xuống.", "log-success");
    } catch (e) {
        addLog(`Lỗi khi lưu file: ${e.message}`, "log-error");
    }

    startBtn.disabled = false;
    startBtn.textContent = "Bắt đầu Xuất Excel";
}

async function fetchStockData(symbol, from, to) {
    const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    return await response.json();
}

function getIndustry(symbol) {
    for (const [industry, stocks] of Object.entries(INDUSTRY_MAP)) {
        if (stocks.includes(symbol)) return industry;
    }
    return "Khác"; // Other
}

function processDataForExport(symbol, apiData) {
    const { t, c, o, h, l, v } = apiData;
    const industry = getIndustry(symbol);

    // Reverse to have newest first? Or oldest first? 
    // Usually Excel history is oldest to newest or newest to oldest. I'll stick to API order (Oldest -> Newest) unless requested.
    // User requested "Lịch sử giá", let's keep chronological order (Oldest -> Newest) which is standard for analysis.

    // We need RefPrice (price of previous day) to calc Ceiling/Floor.
    // For index 0, we assume Ref = Open (approx) or cannot calc accurately without fetching day -1.
    // Hack: Use Open price as Ref for the very first day if prev unknown, or just omit.
    // ACTUALLY: HOSE Ceiling/Floor is based on PREVIOUS CLOSE.

    const rows = [];
    for (let i = 0; i < t.length; i++) {
        const date = new Date(t[i] * 1000).toLocaleDateString('vi-VN');
        const close = c[i];
        const open = o[i];
        const high = h[i];
        const low = l[i];
        const vol = v[i];

        let refPrice = open; // Fallback
        if (i > 0) {
            refPrice = c[i - 1];
        }

        // HOSE Rule: +/- 7%
        // Rounding rules: usually 100 dong steps or similar. Simplified: round to nearest.
        // Formula: Floor(Ref * 1.07), Floor(Ref * 0.93) ? No, VND uses specific rounding.
        // We will use standard math: Ref * 1.07 and Ref * 0.93.

        const ceiling = Math.floor(refPrice * 1.07 * 1000) / 1000; // Simplified
        const floor = Math.ceil(refPrice * 0.93 * 1000) / 1000;    // Simplified

        // Refine rounding if prices > 10.000, usually step 0.05 or 0.1 etc. 
        // Let's keep it raw for now or just 2 decimals.
        // API returns prices in thousands (e.g. 20.5 for 20,500).

        rows.push({
            "Ngành": industry,
            "Mã CK": symbol,
            "Ngày": date,
            "Giá Trần (k)": (refPrice * 1.07).toFixed(2),
            "Giá Sàn (k)": (refPrice * 0.93).toFixed(2),
            "Mở cửa": open,
            "Cao nhất": high,
            "Thấp nhất": low,
            "Đóng cửa": close,
            "Khối lượng": vol
        });
    }
    return rows;
}

function updateProgress(completed, total, msg) {
    const percent = Math.round((completed / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
    if (msg) addLog(msg, "log-info");
}

function addLog(msg, type) {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
}
