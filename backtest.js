/**
 * Advanced Backtest Engine - Standardized
 * Uses standard defaults for all indicators. No user inputs.
 */

const Backtester = {
    // Timeframes (Days)
    TIMEFRAMES: {
        short: [3, 5, 9, 14],
        long: [65, 130, 195, 260] // ~3, 6, 9, 12 months
    },

    LABELS: {
        3: '3 Days', 5: '5 Days', 9: '9 Days', 14: '14 Days',
        65: '3 Months', 130: '6 Months', 195: '9 Months', 260: '1 Year',
        'signal': 'Signal Exit'
    },

    SUPPORTED_STRATEGIES: [
        { key: 'rsi', label: 'RSI (14)' },
        { key: 'bollinger', label: 'Bollinger Bands' },
        { key: 'macd', label: 'MACD (12,26,9)' },
        { key: 'sma20', label: 'SMA 20' },
        { key: 'sma50', label: 'SMA 50' },
        { key: 'sma200', label: 'SMA 200' },
        { key: 'ichimoku', label: 'Ichimoku Cloud' },
        { key: 'adx', label: 'ADX (14) Trend' }
    ],

    /**
     * Run Strategy Backtest
     */
    run: function (data, strategyType) {
        let entries = [];
        let exits = [];

        // 1. Calculate Indicators & Signals
        if (strategyType === 'rsi') {
            const rsi = Indicators.calculateRSI(data, 14);
            entries = this.findConditions(rsi, val => val < 30, 14); // Standard Oversold
            exits = this.findConditions(rsi, val => val > 70, 14);   // Standard Overbought
        }
        else if (strategyType === 'bollinger') {
            const bb = Indicators.calculateBollinger(data, 20, 2);
            for (let i = 20; i < data.length; i++) {
                if (data[i].close < bb.lower[i]) entries.push(i);
                if (data[i].close > bb.upper[i]) exits.push(i);
            }
        }
        else if (strategyType === 'macd') {
            const res = Indicators.calculateMACD(data, 12, 26, 9);
            // Buy: MACD crosses above Signal
            entries = this.findCrossovers(res.macd, res.signal, 'up', 26);
            // Sell: MACD crosses below Signal
            exits = this.findCrossovers(res.macd, res.signal, 'down', 26);
        }
        else if (strategyType === 'sma20') {
            const sma = Indicators.calculateSMA(data, 20);
            // Buy: Price crosses above SMA
            const prices = data.map(d => d.close);
            entries = this.findCrossovers(prices, sma, 'up', 20);
            exits = this.findCrossovers(prices, sma, 'down', 20);
        }
        else if (strategyType === 'sma50') {
            const sma = Indicators.calculateSMA(data, 50);
            const prices = data.map(d => d.close);
            entries = this.findCrossovers(prices, sma, 'up', 50);
            exits = this.findCrossovers(prices, sma, 'down', 50);
        }
        else if (strategyType === 'sma200') {
            const sma = Indicators.calculateSMA(data, 200);
            const prices = data.map(d => d.close);
            entries = this.findCrossovers(prices, sma, 'up', 200);
            exits = this.findCrossovers(prices, sma, 'down', 200);
        }
        else if (strategyType === 'ichimoku') {
            const ichi = Indicators.calculateIchimoku(data); // Standard 9, 26, 52
            for (let i = 52; i < data.length; i++) {
                // Buy: Price > Span A AND Price > Span B (Above Cloud)
                // Filter: Only trigger when it newly crosses above? Or just "Is Above"?
                // Let's use "Price crosses above the highest of Span A/B" (Kumo Breakout)
                const cloudTop = Math.max(ichi.spanA[i], ichi.spanB[i]);
                const cloudBottom = Math.min(ichi.spanA[i], ichi.spanB[i]);
                const prevClose = data[i - 1].close;
                const close = data[i].close;

                // Simple Kumo Breakout
                if (prevClose <= cloudTop && close > cloudTop) entries.push(i);
                if (prevClose >= cloudBottom && close < cloudBottom) exits.push(i);
            }
        }
        else if (strategyType === 'adx') {
            // ADX > 20 and +DI crosses above -DI
            const adx = Indicators.calculateADX(data, 14);

            for (let i = 14; i < data.length; i++) {
                if (adx.adx[i] > 20) {
                    // Check crossover
                    if (adx.diPlus[i - 1] <= adx.diMinus[i - 1] && adx.diPlus[i] > adx.diMinus[i]) {
                        entries.push(i);
                    }
                    if (adx.diPlus[i - 1] >= adx.diMinus[i - 1] && adx.diPlus[i] < adx.diMinus[i]) {
                        exits.push(i);
                    }
                }
            }
        }

        // 2. Perform Tests & Group by Horizon
        let report = {
            short: {},
            long: {},
            signal: null
        };

        this.TIMEFRAMES.short.forEach(h => {
            report.short[h] = this.evaluateHypotheticalTrades(data, entries, 'fixed', h);
        });

        this.TIMEFRAMES.long.forEach(h => {
            report.long[h] = this.evaluateHypotheticalTrades(data, entries, 'fixed', h);
        });

        // Answer "Signal Exit" stats
        report.signal = this.evaluateSignalTrades(data, entries, exits);

        return report;
    },

    // Helpers
    findConditions: function (arr, predicate, startIndex) {
        let indices = [];
        for (let i = startIndex; i < arr.length; i++) {
            if (arr[i] !== null && predicate(arr[i])) indices.push(i);
        }
        return indices;
    },

    findCrossovers: function (seriesA, seriesB, direction, startIndex) {
        let indices = [];
        for (let i = startIndex; i < seriesA.length; i++) {
            if (seriesA[i - 1] === null || seriesB[i - 1] === null) continue;

            if (direction === 'up') {
                if (seriesA[i - 1] <= seriesB[i - 1] && seriesA[i] > seriesB[i]) indices.push(i);
            } else {
                if (seriesA[i - 1] >= seriesB[i - 1] && seriesA[i] < seriesB[i]) indices.push(i);
            }
        }
        return indices;
    },

    evaluateHypotheticalTrades: function (data, entryIndices, type, parameter) {
        let trades = [];
        entryIndices.forEach(idx => {
            let exitIdx = idx + parameter;
            if (exitIdx < data.length) {
                const pnl = (data[exitIdx].close - data[idx].close) / data[idx].close;
                trades.push({
                    entryDate: data[idx].date,
                    entryPrice: data[idx].close,
                    exitDate: data[exitIdx].date,
                    exitPrice: data[exitIdx].close,
                    days: parameter,
                    pnl: pnl
                });
            }
        });
        return this.calculateStats(trades);
    },

    evaluateSignalTrades: function (data, entryIndices, exitIndices) {
        let trades = [];
        entryIndices.forEach(entryIdx => {
            const exitIdx = exitIndices.find(e => e > entryIdx);
            if (exitIdx) {
                const pnl = (data[exitIdx].close - data[entryIdx].close) / data[entryIdx].close;
                trades.push({
                    entryDate: data[entryIdx].date,
                    entryPrice: data[entryIdx].close,
                    exitDate: data[exitIdx].date,
                    exitPrice: data[exitIdx].close,
                    days: exitIdx - entryIdx,
                    pnl: pnl
                });
            }
        });
        return this.calculateStats(trades);
    },

    calculateStats: function (trades) {
        if (trades.length === 0) return {
            count: 0, winRate: 0, avgReturn: 0,
            wins: 0, losses: 0, maxWin: 0, maxLoss: 0,
            trades: []
        };

        const wins = trades.filter(t => t.pnl > 0).length;
        const totalReturn = trades.reduce((sum, t) => sum + t.pnl, 0);

        let maxWin = 0;
        let maxLoss = 0;
        trades.forEach(t => {
            if (t.pnl > maxWin) maxWin = t.pnl;
            if (t.pnl < maxLoss) maxLoss = t.pnl;
        });

        return {
            count: trades.length,
            wins: wins,
            losses: trades.length - wins,
            winRate: (wins / trades.length) * 100,
            avgReturn: (totalReturn / trades.length) * 100,
            maxWin: maxWin * 100,
            maxLoss: maxLoss * 100,
            trades: trades
        };
    }
};
