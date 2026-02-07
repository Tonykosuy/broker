const VN100 = [
    // VN30
    "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG",
    "MBB", "MSN", "MWG", "PLX", "POW", "SAB", "SHB", "SSB", "SSI", "STB",
    "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VRE",
    // Midcap & Others (Representative list of VN100)
    "AAA", "AGG", "ANV", "APH", "ASM", "BCG", "BMP", "BSI", "BWE", "CII",
    "CMG", "CRE", "CTD", "CTR", "CTS", "DBC", "DCM", "DGC", "DGW", "DHA",
    "DIG", "DPM", "DPR", "DXG", "EIB", "ELC", "EVF", "FCN", "FTS", "GEG",
    "GEX", "GMD", "GRE", "HAH", "HBC", "HCM", "HDC", "HDG", "HHV", "HSG",
    "HT1", "IJC", "KBC", "KDC", "KDH", "KHG", "LCG", "LPB", "MSB", "NAB",
    "NKG", "NLG", "NT2", "NVL", "OCB", "ORS", "PAN", "PC1", "PDR", "PET",
    "PHR", "PNJ", "PTB", "PVD", "PVT", "REE", "SAM", "SBT", "SCR", "SCS",
    "SJS", "SKG", "SZC", "TCH", "TNG", "VCI", "VCG", "VGC", "VHC", "VIX",
    "VND", "VOS", "VPI", "VSC"
];

const stockSelect = document.getElementById('stock-select'); // Now a datalist input or select
const stockInput = document.getElementById('stock-input');   // New input
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const fetchBtn = document.getElementById('fetch-btn');
const downloadBtn = document.getElementById('download-btn');
const errorMsg = document.getElementById('error-message');
const tableBody = document.querySelector('#data-table tbody');
let chartInstance = null;
let currentData = [];

// Initialize
function init() {
    // Populate Stock Options in Datalist
    const datalist = document.getElementById('stock-list');
    VN100.sort().forEach(ticker => {
        const option = document.createElement('option');
        option.value = ticker;
        datalist.appendChild(option);
    });

    // Set default dates (last 30 days)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);

    endDateInput.valueAsDate = today;
    startDateInput.valueAsDate = lastMonth;

    // Event Listeners
    fetchBtn.addEventListener('click', handleFetch);
    downloadBtn.addEventListener('click', handleDownload);
}

async function handleFetch() {
    let symbol = stockInput.value.trim().toUpperCase();
    if (!symbol) {
        showError("Vui lòng nhập mã cổ phiếu.");
        return;
    }
    const startObj = new Date(startDateInput.value);
    const endObj = new Date(endDateInput.value);

    // Set end date to end of day
    endObj.setHours(23, 59, 59);

    if (startObj > endObj) {
        showError("Ngày bắt đầu không thể lớn hơn ngày kết thúc.");
        return;
    }

    const startTs = Math.floor(startObj.getTime() / 1000);
    const endTs = Math.floor(endObj.getTime() / 1000);

    fetchBtn.disabled = true;
    fetchBtn.textContent = "Đang tải...";
    hideError();
    downloadBtn.disabled = true;

    try {
        const data = await fetchStockData(symbol, startTs, endTs);
        if (!data || data.t.length === 0) {
            showError("Không tìm thấy dữ liệu cho khoảng thời gian này.");
            currentData = [];
            clearDisplay();
        } else {
            currentData = processData(data);
            renderChart(symbol, currentData);
            renderTable(currentData);
            downloadBtn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        showError("Lỗi kết nối đến API hoặc dữ liệu không hợp lệ.");
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = "Lấy dữ liệu";
    }
}

async function fetchStockData(symbol, from, to) {
    const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

function processData(apiData) {
    // API returns separate arrays: t (time), c (close), o (open), h (high), l (low), v (volume)
    const { t, c, o, h, l, v } = apiData;
    return t.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toLocaleDateString('vi-VN'),
        timestamp: timestamp,
        open: o[index],
        high: h[index],
        low: l[index],
        close: c[index],
        volume: v[index]
    }));
}

function renderChart(symbol, data) {
    const chartContainer = document.getElementById('stockChart');
    // Clear previous chart if it exists (ApexCharts appends, so we clear the container)
    // But ApexCharts instance needs to be destroyed properly.
    if (chartInstance) {
        chartInstance.destroy();
    }

    // ApexCharts expects timestamp or date string for x
    // and [Open, High, Low, Close] for y
    const seriesData = data.map(item => ({
        x: new Date(item.timestamp * 1000), // Use Date object for better handling
        y: [item.open, item.high, item.low, item.close]
    }));

    const options = {
        series: [{
            name: symbol,
            data: seriesData
        }],
        chart: {
            type: 'candlestick',
            height: 400,
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: true,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                    reset: true
                }
            }
        },
        title: {
            text: `Biểu đồ nến ${symbol}`,
            align: 'left'
        },
        xaxis: {
            type: 'datetime',
            labels: {
                datetimeFormatter: {
                    year: 'yyyy',
                    month: "MMM 'yy",
                    day: 'dd MMM'
                }
            }
        },
        yaxis: {
            tooltip: {
                enabled: true
            },
            labels: {
                formatter: function (value) {
                    return value.toLocaleString('vi-VN');
                }
            }
        },
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#28a745',
                    downward: '#dc3545'
                }
            }
        }
    };

    chartInstance = new ApexCharts(document.querySelector("#stockChart"), options);
    chartInstance.render();
}

function renderTable(data) {
    tableBody.innerHTML = '';
    // Show newest first
    const reversedData = [...data].reverse();

    reversedData.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.date}</td>
            <td>${row.open.toLocaleString('vi-VN')}</td>
            <td>${row.high.toLocaleString('vi-VN')}</td>
            <td>${row.low.toLocaleString('vi-VN')}</td>
            <td>${row.close.toLocaleString('vi-VN')}</td>
            <td>${row.volume.toLocaleString('vi-VN')}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function handleDownload() {
    if (currentData.length === 0) return;

    const symbol = stockInput.value.trim().toUpperCase();
    const csvContent = "Ngày,Mở cửa,Cao nhất,Thấp nhất,Đóng cửa,Khối lượng\n" +
        currentData.map(r => `${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`).join("\n");

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `${symbol}_History.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
}

function hideError() {
    errorMsg.classList.add('hidden');
}

function clearDisplay() {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    tableBody.innerHTML = '';
}


// --- Guide Modal Logic ---
const GUIDE_CONTENT = {
    'RSI': `
        <h3>Chỉ báo RSI (Relative Strength Index)</h3>
        <p>RSI đo lường tốc độ và thay đổi của biến động giá. Nó dao động từ 0 đến 100.</p>
        <h4>Cách giao dịch:</h4>
        <ul>
            <li><b>MUA:</b> Khi đường RSI giảm xuống dưới 30 (Vùng quá bán - Oversold). Điều này cho thấy giá đã giảm quá đà và có khả năng bật tăng trở lại.</li>
            <li><b>BÁN:</b> Khi đường RSI vượt lên trên 70 (Vùng quá mua - Overbought). Điều này cho thấy giá đã tăng quá nóng và có khả năng điều chỉnh giảm.</li>
        </ul>
        <p><i>Lưu ý: Trong xu hướng mạnh, RSI có thể duy trì ở vùng quá mua/quá bán trong thời gian dài.</i></p>
    `,
    'MACD': `
        <h3>Chỉ báo MACD (Moving Average Convergence Divergence)</h3>
        <p>MACD là chỉ báo theo sau xu hướng, cho thấy mối quan hệ giữa hai đường trung bình động của giá.</p>
        <h4>Cách giao dịch:</h4>
        <ul>
            <li><b>MUA:</b> Khi đường MACD (màu xanh/nhanh) cắt lên trên đường Tín hiệu (Signal - màu đỏ/chậm).</li>
            <li><b>BÁN:</b> Khi đường MACD cắt xuống dưới đường Tín hiệu.</li>
        </ul>
        <p><i>Mẹo: Kết hợp với Histogram. Khi Histogram chuyển từ âm sang dương là tín hiệu mua sớm.</i></p>
    `,
    'Bollinger': `
        <h3>Dải Bollinger (Bollinger Bands)</h3>
        <p>Sử dụng độ lệch chuẩn để đo lường biến động của thị trường. Bao gồm dải trên, dải dưới và đường giữa (SMA 20).</p>
        <h4>Cách giao dịch:</h4>
        <ul>
            <li><b>MUA:</b> Khi giá chạm hoặc xuyên thủng dải dưới (Lower Band) và có dấu hiệu đảo chiều đi lên.</li>
            <li><b>BÁN:</b> Khi giá chạm hoặc xuyên thủng dải trên (Upper Band) và có dấu hiệu đảo chiều đi xuống.</li>
        </ul>
        <p><i>Chiến lược này hiệu quả nhất khi thị trường đi ngang (Sideway).</i></p>
    `,
    'SMA': `
        <h3>Đường Trung Bình Động Đơn Giản (SMA)</h3>
        <p>SMA làm mượt dữ liệu giá để xác định xu hướng dễ dàng hơn.</p>
        <h4>Cách giao dịch (SMA 20):</h4>
        <ul>
            <li><b>MUA:</b> Khi giá cắt từ dưới lên trên đường SMA 20. Biểu hiện xu hướng tăng ngắn hạn bắt đầu.</li>
            <li><b>BÁN:</b> Khi giá cắt từ trên xuống dưới đường SMA 20. Biểu hiện xu hướng giảm bắt đầu.</li>
        </ul>
    `,
    'Ichimoku': `
        <h3>Mây Ichimoku (Ichimoku Kinko Hyo)</h3>
        <p>Hệ thống chỉ báo toàn diện xác định xu hướng, hỗ trợ/kháng cự và động lượng.</p>
        <h4>Cách giao dịch cơ bản:</h4>
        <ul>
            <li><b>MUA:</b> Khi giá nằm trên Đám Mây (Kumo) VÀ đường Tenkan-sen cắt lên đường Kijun-sen.</li>
            <li><b>BÁN:</b> Khi giá nằm dưới Đám Mây VÀ đường Tenkan-sen cắt xuống đường Kijun-sen.</li>
        </ul>
    `,
    'Stochastic': `
        <h3>Chỉ báo Stochastic Oscillator</h3>
        <p>Xác định vùng đảo chiều tiềm năng dựa trên xung lượng giá.</p>
        <h4>Cách giao dịch:</h4>
        <ul>
            <li><b>MUA:</b> Khi đường %K cắt lên đường %D ở vùng dưới 20 (Quá bán).</li>
            <li><b>BÁN:</b> Khi đường %K cắt xuống đường %D ở vùng trên 80 (Quá mua).</li>
        </ul>
    `,
    'ADX': `
        <h3>Chỉ báo ADX (Average Directional Index)</h3>
        <p>Đo lường sức mạnh của xu hướng, không phân biệt tăng hay giảm.</p>
        <h4>Cách giao dịch:</h4>
        <ul>
            <li><b>MUA:</b> Khi đường ADX > 25 (Xu hướng mạnh) VÀ đường +DI cắt lên trên -DI.</li>
            <li><b>BÁN:</b> Khi đường ADX > 25 VÀ đường -DI cắt lên trên +DI.</li>
        </ul>
        <p><i>Lưu ý: Nếu ADX < 20, thị trường đang đi ngang, hạn chế giao dịch theo xu hướng.</i></p>
    `
};

window.openGuide = function (type) {
    const modal = document.getElementById('guide-modal');
    const content = document.getElementById('guide-content');

    if (GUIDE_CONTENT[type]) {
        content.innerHTML = GUIDE_CONTENT[type];
        modal.style.display = 'block';
    }
}

// Close Modal Logic
document.addEventListener('DOMContentLoaded', () => {
    init(); // Calling original init

    const guideModal = document.getElementById('guide-modal');
    const guideSpan = document.getElementsByClassName("close-guide")[0];

    if (guideSpan) {
        guideSpan.onclick = function () {
            guideModal.style.display = "none";
        }
    }

    // Combine window click events for all modals
    window.addEventListener('click', (event) => {
        const sectorModal = document.getElementById('sector-modal');
        const detailModal = document.getElementById('bt-detail-sidebar');

        if (event.target == guideModal) {
            guideModal.style.display = "none";
        }
        if (event.target == sectorModal) {
            sectorModal.style.display = "none";
        }
        if (event.target == detailModal) {
            detailModal.style.display = "none";
        }
    });
});

