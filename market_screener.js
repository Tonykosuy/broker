/**
 * Market Screener - Automated Stock Screening Engine
 * Scans all stocks, runs backtests, and ranks by win rate
 */

const MarketScreener = {
    // Complete stock list organized by sector (from user's list)
    STOCK_LIST: {
        "Ngân hàng": ["VCB", "BID", "CTG", "MBB", "TCB", "ACB", "VPB", "HDB", "STB", "VIB", "TPB", "EIB", "SHB", "OCB", "MSB", "SSB", "LPB"],
        "Bất động sản": ["VIC", "VHM", "VRE", "NVL", "KDH", "PDR", "DIG", "DXG", "NLG", "KBC", "VPI", "HDG", "CRE", "AGG", "TCH", "SCR", "HQC", "DXS"],
        "Chứng khoán": ["SSI", "VND", "VCI", "HCM", "FTS", "BSI", "CTS", "AGR", "VIX", "ORS", "TVS"],
        "Thép & VLXD": ["HPG", "HSG", "NKG", "VGS", "POM", "HT1", "BCC"],
        "Thực phẩm & Đồ uống": ["VNM", "MSN", "SAB", "KDC", "SBT", "VHC", "ANV", "DBC", "PAN", "LTG"],
        "Bán lẻ & Công nghệ": ["MWG", "PNJ", "FRT", "PET", "DGW", "FPT", "CMG", "ELC"],
        "Dầu khí & Năng lượng": ["GAS", "PLX", "POW", "PVD", "PVT", "PXS", "GEG", "NT2", "REE", "PC1"],
        "Phân bón & Hóa chất": ["DPM", "DCM", "DGC", "CSV", "GVR", "PHR", "DPR"],
        "Vận tải & Cảng": ["GMD", "VJC", "HVN", "HAH", "VOS"],
        "Dầu khí (Nổi bật)": ["BSR", "OIL"],
        "Ngân hàng (UPCOM)": ["BVB", "NAB", "ABB", "VBB", "KLB", "PGB", "SGB"],
        "Khu Công nghiệp": ["SIP", "NTC", "VRG", "VEF", "VTP"],
        "Viễn thông & CNTT": ["VGI", "FOX", "TTN"],
        "Thực phẩm & Tiêu dùng": ["QNS", "MCH", "MML", "VOC", "VGT"],
        "Cảng & Vận tải": ["ACV", "PHP", "SGP", "VNA"],
        "Năng lượng & Nước": ["QTP", "BWE", "DNW"],
        "Khác": ["VEA", "G36", "C4G"]
    },

    // Get all unique symbols
    getAllSymbols() {
        const allSymbols = new Set();
        Object.values(this.STOCK_LIST).forEach(arr => {
            arr.forEach(s => allSymbols.add(s));
        });
        return Array.from(allSymbols);
    },

    // Get sector for a symbol
    getSector(symbol) {
        for (const [sector, symbols] of Object.entries(this.STOCK_LIST)) {
            if (symbols.includes(symbol)) return sector;
        }
        return "Khác";
    },

    // Storage for all results
    allResults: {},
    isScanning: false,

    // Fetch stock data (reuse existing function)
    async fetchData(symbol) {
        // Get data from earliest possible date (2000) to now
        const from = Math.floor(new Date('2000-01-01').getTime() / 1000);
        const to = Math.floor(Date.now() / 1000);

        const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (!data || !data.t || data.t.length < 100) {
                return null; // Not enough data
            }

            // Convert to standard format
            return data.t.map((t, i) => ({
                timestamp: t,
                date: new Date(t * 1000),
                open: data.o[i],
                high: data.h[i],
                low: data.l[i],
                close: data.c[i],
                volume: data.v[i]
            }));
        } catch (e) {
            console.warn(`Failed to fetch ${symbol}:`, e.message);
            return null;
        }
    },

    // Run full market scan
    async runFullScan(onProgress) {
        if (this.isScanning) return;
        this.isScanning = true;
        this.allResults = {};

        const symbols = this.getAllSymbols();
        const total = symbols.length;
        let completed = 0;
        let errors = 0;

        for (const symbol of symbols) {
            try {
                if (onProgress) {
                    onProgress({
                        current: completed,
                        total: total,
                        symbol: symbol,
                        percent: Math.round((completed / total) * 100),
                        errors: errors
                    });
                }

                const data = await this.fetchData(symbol);

                if (data && data.length >= 100) {
                    // Run all strategies
                    const reports = {};
                    Backtester.SUPPORTED_STRATEGIES.forEach(strat => {
                        reports[strat.key] = Backtester.run(data, strat.key);
                    });

                    // Get current price for recommendations
                    const lastPrice = data[data.length - 1].close;

                    this.allResults[symbol] = {
                        data: data,
                        reports: reports,
                        lastPrice: lastPrice,
                        dataPoints: data.length,
                        firstDate: data[0].date,
                        lastDate: data[data.length - 1].date
                    };
                } else {
                    errors++;
                }

                completed++;

                // Rate limiting - wait 100ms between requests
                await new Promise(r => setTimeout(r, 100));

            } catch (e) {
                console.error(`Error processing ${symbol}:`, e);
                errors++;
                completed++;
            }
        }

        this.isScanning = false;

        if (onProgress) {
            onProgress({
                current: total,
                total: total,
                symbol: 'DONE',
                percent: 100,
                errors: errors
            });
        }

        return this.generateRankings();
    },

    // Generate rankings from all results
    generateRankings() {
        const shortTermResults = [];
        const longTermResults = [];

        // Process each stock
        Object.entries(this.allResults).forEach(([symbol, result]) => {
            const { reports, lastPrice, data } = result;

            // For each strategy
            Object.entries(reports).forEach(([stratKey, report]) => {
                const stratLabel = Backtester.SUPPORTED_STRATEGIES.find(s => s.key === stratKey)?.label || stratKey;

                // Short-term timeframes (3, 5, 9, 14 days)
                if (report.short) {
                    Object.entries(report.short).forEach(([tf, stats]) => {
                        if (stats.count >= 5) { // Minimum 5 trades
                            shortTermResults.push({
                                symbol: symbol,
                                sector: this.getSector(symbol),
                                strategy: stratKey,
                                strategyLabel: stratLabel,
                                timeframe: tf,
                                timeframeLabel: Backtester.LABELS[tf] || tf,
                                winRate: stats.winRate,
                                avgReturn: stats.avgReturn,
                                totalReturn: stats.avgReturn * stats.count,
                                maxWin: stats.maxWin,
                                maxLoss: stats.maxLoss,
                                trades: stats.count,
                                wins: stats.wins,
                                losses: stats.losses,
                                lastPrice: lastPrice,
                                allTrades: stats.trades || []
                            });
                        }
                    });
                }

                // Long-term timeframes (65, 130, 195, 260 days)
                if (report.long) {
                    Object.entries(report.long).forEach(([tf, stats]) => {
                        if (stats.count >= 3) { // Minimum 3 trades for long term
                            longTermResults.push({
                                symbol: symbol,
                                sector: this.getSector(symbol),
                                strategy: stratKey,
                                strategyLabel: stratLabel,
                                timeframe: tf,
                                timeframeLabel: Backtester.LABELS[tf] || tf,
                                winRate: stats.winRate,
                                avgReturn: stats.avgReturn,
                                totalReturn: stats.avgReturn * stats.count,
                                maxWin: stats.maxWin,
                                maxLoss: stats.maxLoss,
                                trades: stats.count,
                                wins: stats.wins,
                                losses: stats.losses,
                                lastPrice: lastPrice,
                                allTrades: stats.trades || []
                            });
                        }
                    });
                }
            });
        });

        // Sort by win rate descending
        shortTermResults.sort((a, b) => b.winRate - a.winRate);
        longTermResults.sort((a, b) => b.winRate - a.winRate);

        // --- DEDUPLICATE: Keep only highest Win Rate per symbol ---
        const deduplicateBySymbol = (results) => {
            const seenSymbols = new Set();
            return results.filter(item => {
                if (seenSymbols.has(item.symbol)) return false;
                seenSymbols.add(item.symbol);
                return true;
            });
        };

        const uniqueShort = deduplicateBySymbol(shortTermResults);
        const uniqueLong = deduplicateBySymbol(longTermResults);

        // Get top 10 (Long-term is independent, may have overlapping symbols)
        const top10Short = uniqueShort.slice(0, 10);
        const top10Long = uniqueLong.slice(0, 10);

        // Generate recommendations for each
        top10Short.forEach(item => {
            item.recommendation = this.generateRecommendation(item);
        });

        top10Long.forEach(item => {
            item.recommendation = this.generateRecommendation(item);
        });

        return {
            shortTerm: top10Short,
            longTerm: top10Long,
            totalStocksScanned: Object.keys(this.allResults).length,
            totalStrategies: Backtester.SUPPORTED_STRATEGIES.length
        };
    },

    // Generate specific recommendation for a result
    generateRecommendation(item) {
        const { symbol, strategy, lastPrice, winRate, avgReturn, maxWin, maxLoss, trades, timeframeLabel } = item;

        // Calculate buy zone (current price with small buffer)
        const buyPrice = lastPrice;
        const buyLow = lastPrice * 0.97;
        const buyHigh = lastPrice * 1.03;

        // Calculate targets based on average return
        const expectedReturn = Math.max(avgReturn / 100, 0.08); // At least 8%
        const targetPrice = lastPrice * (1 + expectedReturn);

        // Stop loss based on max loss or default 6%
        const stopLossPercent = Math.min(Math.abs(maxLoss) / 100, 0.06) || 0.06;
        const stopLoss = lastPrice * (1 - stopLossPercent);

        // Risk/Reward ratio
        const risk = lastPrice - stopLoss;
        const reward = targetPrice - lastPrice;
        const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : 1;

        // Strategy-specific conditions
        const conditions = this.getStrategyConditions(strategy);

        // Best month analysis
        const bestMonth = this.findBestMonth(item.allTrades);

        return {
            buyPrice: buyPrice,
            buyLow: buyLow,
            buyHigh: buyHigh,
            targetPrice: targetPrice,
            stopLoss: stopLoss,
            riskReward: rrRatio,
            expectedReturn: (expectedReturn * 100).toFixed(1),
            stopLossPercent: (stopLossPercent * 100).toFixed(1),
            conditions: conditions,
            bestMonth: bestMonth,
            timeframe: timeframeLabel
        };
    },

    // Get strategy-specific buy/sell conditions
    getStrategyConditions(strategy) {
        const conditions = {
            rsi: {
                buy: "Mua khi RSI < 30 (vùng quá bán)",
                sell: "Bán khi RSI > 70 (vùng quá mua) hoặc đạt mục tiêu"
            },
            macd: {
                buy: "Mua khi MACD cắt lên trên Signal (đặc biệt dưới đường 0)",
                sell: "Bán khi MACD cắt xuống Signal hoặc đạt mục tiêu"
            },
            bollinger: {
                buy: "Mua khi giá chạm dải Bollinger dưới",
                sell: "Bán khi giá chạm dải Bollinger trên hoặc đạt mục tiêu"
            },
            sma20: {
                buy: "Mua khi giá cắt lên SMA(20)",
                sell: "Bán khi giá cắt xuống SMA(20) hoặc đạt mục tiêu"
            },
            sma50: {
                buy: "Mua khi giá cắt lên SMA(50)",
                sell: "Bán khi giá cắt xuống SMA(50) hoặc đạt mục tiêu"
            },
            sma200: {
                buy: "Mua khi giá cắt lên SMA(200) - xu hướng dài hạn",
                sell: "Bán khi giá cắt xuống SMA(200) hoặc đạt mục tiêu"
            },
            ichimoku: {
                buy: "Mua khi giá phá vỡ lên trên mây Kumo",
                sell: "Bán khi giá phá vỡ xuống dưới mây Kumo hoặc đạt mục tiêu"
            },
            adx: {
                buy: "Mua khi ADX > 20 và +DI cắt lên -DI (xu hướng mạnh)",
                sell: "Bán khi +DI cắt xuống -DI hoặc ADX suy yếu"
            }
        };

        return conditions[strategy] || { buy: "--", sell: "--" };
    },

    // Find best performing month from trades
    findBestMonth(trades) {
        if (!trades || trades.length === 0) return "--";

        const monthStats = {};
        for (let i = 1; i <= 12; i++) {
            monthStats[i] = { wins: 0, total: 0, profit: 0 };
        }

        trades.forEach(t => {
            const d = typeof t.entryDate === 'string' ? new Date(t.entryDate) : t.entryDate;
            if (d instanceof Date && !isNaN(d)) {
                const m = d.getMonth() + 1;
                monthStats[m].total++;
                if (t.pnl > 0) {
                    monthStats[m].wins++;
                    monthStats[m].profit += t.pnl;
                }
            }
        });

        // Find month with best win rate (min 2 trades)
        let bestMonth = null;
        let bestWinRate = 0;

        for (let m = 1; m <= 12; m++) {
            if (monthStats[m].total >= 2) {
                const wr = monthStats[m].wins / monthStats[m].total;
                if (wr > bestWinRate) {
                    bestWinRate = wr;
                    bestMonth = m;
                }
            }
        }

        return bestMonth ? `Tháng ${bestMonth}` : "--";
    },

    // Calculate dynamic zones and indicator values based on strategy
    calculateDynamicZones(strategy, data) {
        if (!data || data.length === 0) return { buyZone: 0, sellZone: 0, value: 0, name: '' };

        const lastIdx = data.length - 1;
        const lastClose = data[lastIdx].close;
        let buyZone = lastClose;
        let sellZone = lastClose * 1.1; // Default
        let value = 0;
        let name = '';
        let zoneDesc = 'Giá hiện tại';

        try {
            if (strategy === 'rsi') {
                const rsi = Indicators.calculateRSI(data, 14);
                value = rsi[lastIdx];
                name = `RSI(14)`;
                buyZone = lastClose; // RSI doesn't map to a fixed price easily without solving the formula
                zoneDesc = 'Vùng RSI < 30';
                // Estimate sell zone based on classic RSI targets (just generic here)
                sellZone = lastClose * 1.05;
            }
            else if (strategy === 'bollinger') {
                const bb = Indicators.calculateBollinger(data, 20, 2);
                const lower = bb.lower[lastIdx];
                const upper = bb.upper[lastIdx];
                value = lower; // Showing Lower Band as the key metric
                name = 'BB Lower';
                buyZone = lower;
                sellZone = upper;
                zoneDesc = 'Dải dưới Bollinger';
            }
            else if (strategy === 'macd') {
                const macd = Indicators.calculateMACD(data, 12, 26, 9);
                value = macd.histogram[lastIdx];
                name = 'MACD Hist';
                buyZone = lastClose; // Signal based
                zoneDesc = 'MACD > Signal';
                sellZone = lastClose * 1.05;
            }
            else if (strategy.startsWith('sma')) {
                const period = parseInt(strategy.replace('sma', ''));
                const sma = Indicators.calculateSMA(data, period);
                const smaVal = sma[lastIdx];
                value = smaVal;
                name = `SMA(${period})`;
                buyZone = smaVal;
                zoneDesc = `Đường SMA(${period})`;
                sellZone = smaVal * 1.1; // Generic target
            }
            else if (strategy === 'ichimoku') {
                const ichi = Indicators.calculateIchimoku(data);
                // Span A/B are shifted in chart, but our valid array is aligned. 
                // Let's use Span B (often flat) as support level
                const spanB = ichi.spanB[lastIdx];
                value = spanB;
                name = 'Kumo Cloud';
                buyZone = spanB;
                zoneDesc = 'Mây Kumo';
                sellZone = spanB * 1.1;
            }
            else if (strategy === 'adx') {
                const adx = Indicators.calculateADX(data, 14);
                value = adx.adx[lastIdx];
                name = 'ADX(14)';
                buyZone = lastClose;
                zoneDesc = 'ADX > 20';
                sellZone = lastClose * 1.05;
            }
        } catch (e) {
            console.warn("Zone Calc Error", e);
        }

        return { buyZone, sellZone, value, name, zoneDesc };
    },

    // Apply Dynamic Zones to Recommendation
    generateRecommendation(item) {
        const { symbol, strategy, lastPrice, winRate, avgReturn, maxWin, maxLoss, trades, timeframeLabel, data } = item;

        // Get Dynamic Zones
        const dynamic = this.calculateDynamicZones(strategy, data || []);

        // Setup Zones
        let buyPrice = lastPrice;
        let buyLow = lastPrice * 0.98;
        let buyHigh = lastPrice * 1.02;

        // If strategy provides a specific price level (like BB, SMA), use it as the anchor
        if (dynamic.buyZone && dynamic.buyZone > 0 && strategy !== 'rsi' && strategy !== 'macd' && strategy !== 'adx') {
            buyPrice = dynamic.buyZone;
            buyLow = buyPrice * 0.98;
            buyHigh = buyPrice * 1.02;
        }

        // Calculate targets based on average return or Dynamic Sell Zone
        const expectedReturn = Math.max(avgReturn / 100, 0.08); // At least 8%

        let targetPrice = buyPrice * (1 + expectedReturn);
        // If dynamic sell zone is reasonable (higher than buy), use it
        if (dynamic.sellZone > buyPrice * 1.02) {
            targetPrice = dynamic.sellZone;
        }

        // Stop loss
        const stopLossPercent = Math.min(Math.abs(maxLoss) / 100, 0.06) || 0.06;
        const stopLoss = buyPrice * (1 - stopLossPercent);

        // Risk/Reward ratio
        const risk = buyPrice - stopLoss;
        const reward = targetPrice - buyPrice;
        const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : 1;

        // Strategy-specific conditions
        const conditions = this.getStrategyConditions(strategy);

        // Best month analysis
        const bestMonth = this.findBestMonth(item.allTrades);

        return {
            buyPrice: buyPrice,
            buyLow: buyLow,
            buyHigh: buyHigh,
            targetPrice: targetPrice,
            stopLoss: stopLoss,
            riskReward: rrRatio,
            expectedReturn: ((targetPrice - buyPrice) / buyPrice * 100).toFixed(1),
            stopLossPercent: (stopLossPercent * 100).toFixed(1),
            conditions: conditions,
            bestMonth: bestMonth,
            timeframe: timeframeLabel,
            indicatorName: dynamic.name,
            indicatorValue: dynamic.value,
            zoneDesc: dynamic.zoneDesc
        };
    },


    // Format price with thousands separator
    formatPrice(price) {
        if (!price) return "--";
        return price.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
    },

    // Render results to UI
    renderResults(rankings) {
        const container = document.getElementById('market-scan-results');
        if (!container) return;

        container.style.display = 'block';
        container.innerHTML = '';

        // Summary header
        const summaryHtml = `
            <div style="background: linear-gradient(135deg, #1a237e 0%, #283593 100%); padding: 20px; border-radius: 12px; color: white; margin-bottom: 30px; text-align: center;">
                <h2 style="margin: 0 0 10px 0;">🎯 KẾT QUẢ SÀNG LỌC THỊ TRƯỜNG</h2>
                <div style="display: flex; justify-content: center; gap: 40px; flex-wrap: wrap;">
                    <div><span style="font-size: 2em; font-weight: bold;">${rankings.totalStocksScanned}</span><br>Mã đã quét</div>
                    <div><span style="font-size: 2em; font-weight: bold;">${rankings.totalStrategies}</span><br>Chiến lược</div>
                    <div><span style="font-size: 2em; font-weight: bold;">20</span><br>Top Kết quả</div>
                </div>
            </div>
        `;
        container.innerHTML = summaryHtml;

        // Short-term section
        const shortSection = document.createElement('div');
        shortSection.innerHTML = `<h3 style="color: #0d47a1; border-bottom: 3px solid #ff9800; padding-bottom: 10px; margin-bottom: 20px;">⚡ TOP 10 - NGẮN HẠN (3-14 NGÀY)</h3>`;
        rankings.shortTerm.forEach((item, idx) => {
            shortSection.appendChild(this.createRecommendationCard(item, idx + 1));
        });
        container.appendChild(shortSection);

        // Long-term section
        const longSection = document.createElement('div');
        longSection.style.marginTop = '40px';
        longSection.innerHTML = `<h3 style="color: #0d47a1; border-bottom: 3px solid #4caf50; padding-bottom: 10px; margin-bottom: 20px;">📈 TOP 10 - DÀI HẠN (3-12 THÁNG)</h3>`;
        rankings.longTerm.forEach((item, idx) => {
            longSection.appendChild(this.createRecommendationCard(item, idx + 1));
        });
        container.appendChild(longSection);
    },

    // Create a COMPACT recommendation card with expandable details
    createRecommendationCard(item, rank) {
        const { symbol, strategyLabel, winRate, avgReturn, trades, wins, losses, lastPrice, maxWin, maxLoss, sector, timeframeLabel } = item;
        const rec = item.recommendation;

        const card = document.createElement('div');
        card.style.marginBottom = '15px';

        const badgeColor = rank === 1 ? '#ff9800' : (rank === 2 ? '#9e9e9e' : (rank === 3 ? '#cd7f32' : '#607d8b'));
        const cardId = `card-detail-${symbol}-${rank}`;

        card.innerHTML = `
            <!-- COMPACT CARD (Always visible) -->
            <div onclick="document.getElementById('${cardId}').style.display = document.getElementById('${cardId}').style.display === 'none' ? 'block' : 'none'" 
                 style="display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #1a237e 0%, #283593 100%); color: white; padding: 15px 20px; border-radius: 10px; cursor: pointer; transition: transform 0.2s;" 
                 onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="background: ${badgeColor}; color: white; padding: 4px 12px; border-radius: 15px; font-weight: bold; font-size: 0.85em;">#${rank}</span>
                    <span style="font-size: 1.3em; font-weight: bold;">${symbol}</span>
                    <span style="opacity: 0.8; font-size: 0.85em;">${sector}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                    <div style="text-align: center;"><div style="font-size: 0.7em; opacity: 0.8;">Giá Hiện Tại</div><div style="font-weight: bold; color: #fff;">${this.formatPrice(lastPrice)}</div></div>
                    <div style="text-align: center;"><div style="font-size: 0.7em; opacity: 0.8;">Win Rate</div><div style="font-weight: bold; color: #4caf50;">${winRate.toFixed(1)}%</div></div>
                    <div style="text-align: center;"><div style="font-size: 0.7em; opacity: 0.8;">Vùng Mua</div><div style="font-weight: bold; color: #64b5f6;">${this.formatPrice(rec.buyLow)} - ${this.formatPrice(rec.buyHigh)}</div></div>
                    <div style="text-align: center;"><div style="font-size: 0.7em; opacity: 0.8;">Vùng Bán</div><div style="font-weight: bold; color: #ffeb3b;">${this.formatPrice(rec.targetPrice)}</div></div>
                    <div style="text-align: center;"><div style="font-size: 0.7em; opacity: 0.8;">Tháng Tốt</div><div style="font-weight: bold;">${rec.bestMonth}</div></div>
                    <div style="font-size: 1.2em;">▼</div>
                </div>
            </div>

            <!-- EXPANDED DETAILS (Hidden by default) -->
            <div id="${cardId}" style="display: none; margin-top: 10px; padding: 20px; background: linear-gradient(135deg, #1a237e 0%, #283593 100%); border-radius: 10px; color: white;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px;">
                    <div style="font-size: 0.9em;">🏆 Chiến lược: <strong>${strategyLabel}</strong> | Khung: <strong>${timeframeLabel}</strong></div>
                    <div>📈 ${trades} lệnh (${wins} lời / ${losses} lỗ)</div>
                </div>
                
                <!-- Buy & Sell Zones -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
                    <div style="background: rgba(76, 175, 80, 0.2); border-left: 4px solid #4caf50; padding: 15px; border-radius: 8px;">
                        <div style="font-weight: bold; margin-bottom: 8px;">📈 VÙNG MUA</div>
                        <div style="font-size: 1.3em; font-weight: bold;">${this.formatPrice(rec.buyPrice)}</div>
                        <div style="font-size: 0.85em; opacity: 0.9;">Vùng: ${this.formatPrice(rec.buyLow)} - ${this.formatPrice(rec.buyHigh)}</div>
                        <div style="font-size: 0.8em; margin-top: 8px; opacity: 0.85;">${rec.conditions.buy}</div>
                    </div>
                    <div style="background: rgba(244, 67, 54, 0.2); border-left: 4px solid #f44336; padding: 15px; border-radius: 8px;">
                        <div style="font-weight: bold; margin-bottom: 8px;">📉 VÙNG BÁN</div>
                        <div style="font-size: 1.3em; font-weight: bold;">${this.formatPrice(rec.targetPrice)}</div>
                        <div style="font-size: 0.85em;"><span style="color:#4caf50;">TP: ${this.formatPrice(rec.targetPrice)}</span> | <span style="color:#f44336;">SL: ${this.formatPrice(rec.stopLoss)}</span></div>
                        <div style="font-size: 0.8em; margin-top: 8px; opacity: 0.85;">${rec.conditions.sell}</div>
                    </div>
                </div>

                <!-- Metrics -->
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
                    <div style="background: rgba(255,255,255,0.1); padding: 8px 15px; border-radius: 20px; font-size: 0.85em;">📊 Win: <strong>${winRate.toFixed(1)}%</strong></div>
                    <div style="background: rgba(255,255,255,0.1); padding: 8px 15px; border-radius: 20px; font-size: 0.85em;">💰 TB: <strong>${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%</strong></div>
                    <div style="background: rgba(255,255,255,0.1); padding: 8px 15px; border-radius: 20px; font-size: 0.85em;">🎯 R:R: <strong>1:${rec.riskReward}</strong></div>
                    <div style="background: rgba(33, 150, 243, 0.2); padding: 8px 15px; border-radius: 20px; font-size: 0.85em;">📅 Tháng Tốt: <strong>${rec.bestMonth}</strong></div>
                    <div style="background: rgba(255, 152, 0, 0.2); padding: 8px 15px; border-radius: 20px; font-size: 0.85em;">📈 ${rec.indicatorName}: <strong>${rec.indicatorValue.toFixed(2)}</strong></div>
                </div>

                <!-- Action Plan -->
                <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px;">
                    <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px;">📋 KẾ HOẠCH HÀNH ĐỘNG CHI TIẾT</div>
                    <div style="display: grid; gap: 12px;">
                        <div style="display: flex; gap: 12px; align-items: flex-start;">
                            <div style="background: #ff9800; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">1</div>
                            <div><div style="font-weight: bold; margin-bottom: 4px;">Điều Kiện Vào Lệnh</div><div style="font-size: 0.9em; opacity: 0.9;">${rec.conditions.buy} Giá hiện tại: ${this.formatPrice(lastPrice)}. Vùng mua lý tưởng: ${this.formatPrice(rec.buyPrice)}</div></div>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: flex-start;">
                            <div style="background: #2196f3; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">2</div>
                            <div><div style="font-weight: bold; margin-bottom: 4px;">Khối Lượng Đề Xuất</div><div style="font-size: 0.9em; opacity: 0.9;">Giá đang ${lastPrice <= rec.buyHigh ? 'trong' : 'ngoài'} vùng mua (cách ${Math.abs((lastPrice - rec.buyPrice) / rec.buyPrice * 100).toFixed(1)}%). Chia làm 3 đợt: 40% - 30% - 30%</div></div>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: flex-start;">
                            <div style="background: #4caf50; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">3</div>
                            <div><div style="font-weight: bold; margin-bottom: 4px;">Điểm Chốt Lời</div><div style="font-size: 0.9em; opacity: 0.9;">Chốt lời tại ${this.formatPrice(rec.targetPrice)} (Lợi nhuận kỳ vọng: +${rec.expectedReturn}%). ${rec.conditions.sell}</div></div>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: flex-start;">
                            <div style="background: #f44336; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0;">4</div>
                            <div><div style="font-weight: bold; margin-bottom: 4px;">Điểm Cắt Lỗ</div><div style="font-size: 0.9em; opacity: 0.9;">Cắt lỗ tại ${this.formatPrice(rec.stopLoss)} (-${rec.stopLossPercent}%). R:R = 1:${rec.riskReward}. Không để mất quá 5% vốn.</div></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return card;
    }
};

// Initialize when DOM ready
window.MarketScreener = MarketScreener;
