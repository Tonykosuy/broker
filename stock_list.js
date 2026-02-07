const INDUSTRY_MAP = {
    "Ngân hàng": [
        { s: "BID", n: "Ngân hàng Đầu tư và Phát triển Việt Nam" },
        { s: "CTG", n: "VietinBank" },
        { s: "VCB", n: "Vietcombank" },
        { s: "MBB", n: "Ngân hàng Quân đội" },
        { s: "TCB", n: "Techcombank" },
        { s: "VPB", n: "VPBank" },
        { s: "HDB", n: "HDBank" },
        { s: "STB", n: "Sacombank" },
        { s: "EIB", n: "Eximbank" }
    ],
    "Bất động sản": [
        { s: "VIC", n: "Vingroup" },
        { s: "VHM", n: "Vinhomes" },
        { s: "NVL", n: "Novaland" },
        { s: "KDH", n: "Khang Điền" },
        { s: "PDR", n: "Phát Đạt" },
        { s: "DIG", n: "DIC Corp" },
        { s: "DXG", n: "Đất Xanh Group" }
    ],
    "Thực phẩm & Đồ uống": [
        { s: "VNM", n: "Vinamilk" },
        { s: "SAB", n: "Sabeco" },
        { s: "MSN", n: "Masan Group" },
        { s: "QNS", n: "Đường Quảng Ngãi" }
    ],
    "Bán lẻ & Tiêu dùng": [
        { s: "MWG", n: "Thế Giới Di Động" },
        { s: "FRT", n: "FPT Retail" },
        { s: "PNJ", n: "Phú Nhuận Jewelry" }
    ],
    "Năng lượng & Hóa chất": [
        { s: "GAS", n: "PV Gas" },
        { s: "PLX", n: "Petrolimex" },
        { s: "POW", n: "PV Power" },
        { s: "DPM", n: "Phân bón Dầu khí" },
        { s: "GVR", n: "Cao su Việt Nam" }
    ],
    "Công nghệ & Viễn thông": [
        { s: "FPT", n: "FPT Corp" },
        { s: "CMG", n: "Công ty CMC" }
    ],
    "Sản xuất & Công nghiệp": [
        { s: "HPG", n: "Hòa Phát Group" },
        { s: "HSG", n: "Hoa Sen Group" },
        { s: "NKG", n: "Nam Kim Steel" },
        { s: "VGC", n: "Viglacera" }
    ],
    "Hàng không & Vận tải": [
        { s: "HVN", n: "Vietnam Airlines" },
        { s: "VJC", n: "Vietjet Air" },
        { s: "GMD", n: "Gemadept" },
        { s: "VSC", n: "Container Việt Nam" }
    ]
};

// Flatten the map to get the full list of symbols
const VN100_FULL = Object.values(INDUSTRY_MAP).flat().map(item => item.s).sort();
