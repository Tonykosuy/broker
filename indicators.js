/**
 * Technical Indicators Calculation Library
 * All functions expect an array of data objects: { date, close, open, high, low, volume, ... }
 * They return an array of the same length, with null/undefined for initial periods where calculation isn't possible.
 */

const Indicators = {

    // Simple Moving Average (SMA)
    calculateSMA: function (data, period) {
        let results = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                results.push(null);
                continue;
            }
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            results.push(sum / period);
        }
        return results;
    },

    // Exponential Moving Average (EMA)
    calculateEMA: function (data, period) {
        let results = [];
        const k = 2 / (period + 1);
        let validIdx = 0;

        // Find first valid close
        while (validIdx < data.length && (data[validIdx].close === null || data[validIdx].close === undefined)) {
            results.push(null);
            validIdx++;
        }

        // First EMA is SMA (or just the first price if we want to start immediately)
        // Let's use SMA for the first 'period' items to stabilize
        if (data.length < period) return data.map(() => null);

        let initialSum = 0;
        for (let i = 0; i < period; i++) {
            initialSum += data[i].close;
            results.push(null); // padding until period
        }
        // Actually the first EMA point is at index `period - 1`
        results[period - 1] = initialSum / period;

        for (let i = period; i < data.length; i++) {
            const prevEMA = results[i - 1];
            const close = data[i].close;
            const ema = (close - prevEMA) * k + prevEMA;
            results.push(ema);
        }
        return results;
    },

    // Bollinger Bands
    calculateBollinger: function (data, period, multiplier) {
        const sma = this.calculateSMA(data, period);
        const stdDev = this.calculateStdDev(data, period); // Needs to use simple StdDev over period

        let bands = { upper: [], lower: [], middle: sma };
        for (let i = 0; i < data.length; i++) {
            if (sma[i] === null || stdDev[i] === null) {
                bands.upper.push(null);
                bands.lower.push(null);
            } else {
                bands.upper.push(sma[i] + (stdDev[i] * multiplier));
                bands.lower.push(sma[i] - (stdDev[i] * multiplier));
            }
        }
        return bands;
    },

    // Standard Deviation (rolling)
    calculateStdDev: function (data, period) {
        let results = [];
        const sma = this.calculateSMA(data, period);

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                results.push(null);
                continue;
            }
            let avg = sma[i];
            let sumSqDiff = 0;
            for (let j = 0; j < period; j++) {
                sumSqDiff += Math.pow(data[i - j].close - avg, 2);
            }
            results.push(Math.sqrt(sumSqDiff / period));
        }
        return results;
    },

    // RSI
    calculateRSI: function (data, period) {
        let results = [];
        let gains = [];
        let losses = [];

        for (let i = 1; i < data.length; i++) {
            const change = data[i].close - data[i - 1].close;
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }

        // Pad first element change
        gains.unshift(0);
        losses.unshift(0);

        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 0; i < data.length; i++) {
            if (i < period) {
                // Initial sum for first average
                results.push(null);
                continue;
            } else if (i === period) {
                // First average
                for (let j = 1; j <= period; j++) {
                    avgGain += gains[j];
                    avgLoss += losses[j];
                }
                avgGain /= period;
                avgLoss /= period;
            } else {
                // Smooth average
                avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
                avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
            }

            if (avgLoss === 0) {
                results.push(100);
            } else {
                const rs = avgGain / avgLoss;
                results.push(100 - (100 / (1 + rs)));
            }
        }
        return results;
    },

    // MACD (12, 26, 9)
    calculateMACD: function (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const emaFast = this.calculateEMA(data, fastPeriod);
        const emaSlow = this.calculateEMA(data, slowPeriod);

        let macdLine = [];
        for (let i = 0; i < data.length; i++) {
            if (emaFast[i] !== null && emaSlow[i] !== null) {
                macdLine.push(emaFast[i] - emaSlow[i]);
            } else {
                macdLine.push(null);
            }
        }

        // Calculate Signal Line (EMA of MACD)
        // We need to create a dummy objects array for calculateEMA because it expects objects with .close
        const macdObjs = macdLine.map(v => ({ close: v }));
        const signalLine = this.calculateEMA(macdObjs, signalPeriod);

        let histogram = [];
        for (let i = 0; i < data.length; i++) {
            if (macdLine[i] !== null && signalLine[i] !== null) {
                histogram.push(macdLine[i] - signalLine[i]);
            } else {
                histogram.push(null);
            }
        }

        return { macd: macdLine, signal: signalLine, histogram: histogram };
    },

    // Stochastic Oscillator
    calculateStochastic: function (data, period = 14, smoothK = 3, smoothD = 3) {
        let kLine = [];

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                kLine.push(null);
                continue;
            }

            let subset = data.slice(i - period + 1, i + 1);
            let highestHigh = Math.max(...subset.map(d => d.high));
            let lowestLow = Math.min(...subset.map(d => d.low));
            let currentClose = data[i].close;

            if (highestHigh === lowestLow) {
                kLine.push(50);
            } else {
                let k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
                kLine.push(k);
            }
        }

        // Smooth %K? Standard Stoch uses SMA for %D, but often %K is also smoothed (Slow Stoch)
        // Let's assume Fast Stochastic if smoothK=1, Slow if smoothK > 1.
        // We need to smooth kLine now.
        const kObjs = kLine.map(v => ({ close: v })); // Helper for SMA
        const smoothedK = this.calculateSMA(kObjs, smoothK);

        const dObjs = smoothedK.map(v => ({ close: v }));
        const smoothedD = this.calculateSMA(dObjs, smoothD); // %D is SMA of %K

        return { k: smoothedK, d: smoothedD };
    },

    // Ichimoku Cloud
    calculateIchimoku: function (data) {
        // Standard settings: 9, 26, 52, 26 (displacement)
        const conversionPeriod = 9;
        const basePeriod = 26;
        const spanBPeriod = 52;
        const displacement = 26;

        let tenkan = []; // Conversion
        let kijun = [];  // Base
        let spanA = [];  // Leading A
        let spanB = [];  // Leading B
        let lagging = []; // Chikou (Close shifted back)

        const getAvg = (period, idx) => {
            if (idx < period - 1) return null;
            let subset = data.slice(idx - period + 1, idx + 1);
            let h = Math.max(...subset.map(d => d.high));
            let l = Math.min(...subset.map(d => d.low));
            return (h + l) / 2;
        };

        for (let i = 0; i < data.length; i++) {
            tenkan.push(getAvg(conversionPeriod, i));
            kijun.push(getAvg(basePeriod, i));

            // Span A: (Tenkan + Kijun) / 2 ... shifted forward by displacement
            // We calculate it for current 'i', but in the chart it should be plotted at i + displacement
            // ApexCharts series data matches index. So we need to align carefully or just return arrays aligned to current dates, 
            // and let the chart extend into future?
            // "Cloud" usually projects into future. ApexCharts needs x-axis for future.

            // For simplicity in this non-drawing library:
            // We'll return arrays aligned with 'data' indices where possible.
            // Future values will be handled by appending data points or just ignored if we only show history.
            // Let's stick to valid range.

            if (tenkan[i] !== null && kijun[i] !== null) {
                // spanA value generated TODAY used for FUTURE (i + 26)
            }
        }

        // Recalculate full arrays with shifts
        // For shift/displacement, we handle by pushing nulls or offsetting.
        // Array length should match data length for alignment, but cloud projects into future.
        // We will return values corresponding to the *current candle's* x-axis position.
        // Use standard approach:
        // Tenkan[i], Kijun[i] = calculated from past.
        // Leading Span A[i] = (Tenkan[i-26] + Kijun[i-26]) / 2  (Value derived 26 bars ago)
        // LEADING SPAN A is plotted 26 bars AHEAD. So at current time T, we see the value calculated at T.
        // BUT usually Span A at time T is derived from (Tenkan[T] + Kijun[T])/2 shifted forward.
        // Actually: Span A [T + 26] = (Tenkan[T] + Kijun[T])/2.
        // So Span A [T] = (Tenkan[T-26] + Kijun[T-26]) / 2.

        for (let i = 0; i < data.length; i++) {
            // Span A and B at current index 'i' (which were calculated 26 bars ago)
            if (i >= displacement) {
                const tPrev = tenkan[i - displacement];
                const kPrev = kijun[i - displacement];
                if (tPrev !== null && kPrev !== null) {
                    spanA.push((tPrev + kPrev) / 2);
                } else {
                    spanA.push(null);
                }

                // Span B
                // Calc average of last 52 (shifted 26 forward, so at T we use High/Low of range [T-26-52...T-26])
                // Value[T+26] = (High52 + Low52)/2.
                // So Value[T] = (High52(at T-26) + Low52(at T-26))/2

                // Get 52-period high/low ending at i - displacement
                const idxPast = i - displacement;
                if (idxPast >= spanBPeriod - 1) {
                    let subset = data.slice(idxPast - spanBPeriod + 1, idxPast + 1);
                    let h = Math.max(...subset.map(d => d.high));
                    let l = Math.min(...subset.map(d => d.low));
                    spanB.push((h + l) / 2);
                } else {
                    spanB.push(null);
                }

                // Chikou: Close price shifted backwards 26 periods.
                // Chikou[T] = Close[T+26]?? No, Chikou[T-26] = Close[T].
                // So at index i, Chikou is Close[i + 26]? No.
                // It plots current close 26 bars back.
                // Effectively, at index i, we see Close[i]. But visually it's drawn at i-26.
                // For a line chart at index i, we wants to see Chikou value?
                // If we draw Chikou line, data[i] should be Close[i+26].
                if (i + displacement < data.length) {
                    lagging.push(data[i + displacement].close);
                } else {
                    lagging.push(null);
                }

            } else {
                spanA.push(null);
                spanB.push(null);
                // Lagging needs future data
                if (i + displacement < data.length) {
                    lagging.push(data[i + displacement].close);
                } else {
                    lagging.push(null);
                }
            }
        }

        return { tenkan, kijun, spanA, spanB, lagging };
    },

    // ADX (Average Directional Index)
    calculateADX: function (data, period = 14) {
        let tr = [];
        let dmPlus = [];
        let dmMinus = [];

        // 1. Calculate TR, +DM, -DM
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                tr.push(data[i].high - data[i].low); // First TR as fallback
                dmPlus.push(0);
                dmMinus.push(0);
                continue;
            }
            const high = data[i].high;
            const low = data[i].low;
            const prevClose = data[i - 1].close;
            const prevHigh = data[i - 1].high;
            const prevLow = data[i - 1].low;

            const trVal = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            tr.push(trVal);

            const upMove = high - prevHigh;
            const downMove = prevLow - low;

            if (upMove > downMove && upMove > 0) dmPlus.push(upMove);
            else dmPlus.push(0);

            if (downMove > upMove && downMove > 0) dmMinus.push(downMove);
            else dmMinus.push(0);
        }

        // 2. Smooth TR, +DM, -DM (Wilder's Smoothing)
        // First value is sum of period
        const smoothWilder = (arr, startIdx, prevVal) => {
            return (prevVal * (period - 1) + arr[startIdx]) / period;
        };

        // Helper arrays
        let trS = [], dmPlusS = [], dmMinusS = [];
        let diPlus = [], diMinus = [], dx = [];

        // Initial sums
        let trSum = 0, dmPlusSum = 0, dmMinusSum = 0;
        for (let i = 0; i < data.length; i++) {
            if (i < period) {
                trSum += tr[i];
                dmPlusSum += dmPlus[i];
                dmMinusSum += dmMinus[i];
                trS.push(null); dmPlusS.push(null); dmMinusS.push(null);
                diPlus.push(null); diMinus.push(null); dx.push(null);
            } else if (i === period) {
                // First smoothed is sum (technically Wilder starts with Sum, then smooths)
                trS.push(trSum);
                dmPlusS.push(dmPlusSum);
                dmMinusS.push(dmMinusSum);

                // Calculate DI and DX
                const dip = (dmPlusSum / trSum) * 100;
                const dim = (dmMinusSum / trSum) * 100;
                diPlus.push(dip);
                diMinus.push(dim);
                dx.push(Math.abs(dip - dim) / (dip + dim) * 100);
            } else {
                // Subsequent
                const trSmooth = (trS[i - 1] * (period - 1) + tr[i]) / period; // Wilder smoothing simplified formula ? No, it's (Prev - Prev/N + Current)
                // Actually Wilder: Prev - (Prev/N) + Curr
                // Standard equivalent is: ((Prev * (N-1)) + Curr) / N ?? No.
                // Re-check Wilder's: S[i] = S[i-1] - (S[i-1]/N) + V[i]

                const wSmooth = (prev, curr) => prev - (prev / period) + curr;

                const curTrS = wSmooth(trS[i - 1], tr[i]);
                const curDmPlusS = wSmooth(dmPlusS[i - 1], dmPlus[i]);
                const curDmMinusS = wSmooth(dmMinusS[i - 1], dmMinus[i]);

                trS.push(curTrS);
                dmPlusS.push(curDmPlusS);
                dmMinusS.push(curDmMinusS);

                const dip = (curDmPlusS / curTrS) * 100;
                const dim = (curDmMinusS / curTrS) * 100;
                diPlus.push(dip);
                diMinus.push(dim);

                if (dip + dim === 0) dx.push(0);
                else dx.push(Math.abs(dip - dim) / (dip + dim) * 100);
            }
        }

        // 3. ADX = SMA of DX over period
        let adx = [];
        // DX line to objs for SMA
        const dxObjs = dx.map(v => ({ close: v })); // Helper
        // Careful, DX has nulls at start.
        // We calculate SMA of DX. SMA logic handles nulls by pushing nulls.
        // ADX starts 'period' bars AFTER DX starts.

        // Manual ADX Smoothing (Wilder uses same smoothing on DX)
        // First ADX = avg of first N DX values.
        // Subsequent = ((PrevADX * (N-1)) + CurrentDX) / N.

        let dxSum = 0;
        let dxCount = 0;
        let firstAdxDone = false;

        for (let i = 0; i < dx.length; i++) {
            if (dx[i] === null) {
                adx.push(null);
                continue;
            }
            if (!firstAdxDone) {
                dxSum += dx[i];
                dxCount++;
                if (dxCount === period) {
                    const val = dxSum / period;
                    adx.push(val);
                    firstAdxDone = true;
                } else {
                    adx.push(null);
                }
            } else {
                const prev = adx[i - 1];
                const val = ((prev * (period - 1)) + dx[i]) / period;
                adx.push(val);
            }
        }

        return { adx, diPlus, diMinus };
    },

    // Fibonacci Retracement
    // Returns object with price levels based on Max High and Min Low of the dataset
    calculateFibonacci: function (data) {
        if (!data || data.length === 0) return null;

        let maxHigh = -Infinity;
        let minLow = Infinity;

        data.forEach(d => {
            if (d.high > maxHigh) maxHigh = d.high;
            if (d.low < minLow) minLow = d.low;
        });

        const diff = maxHigh - minLow;

        return {
            max: maxHigh,
            min: minLow,
            levels: [
                { level: 0, price: maxHigh, text: "0% (High)" },
                { level: 0.236, price: maxHigh - (diff * 0.236), text: "23.6%" },
                { level: 0.382, price: maxHigh - (diff * 0.382), text: "38.2%" },
                { level: 0.5, price: maxHigh - (diff * 0.5), text: "50%" },
                { level: 0.618, price: maxHigh - (diff * 0.618), text: "61.8%" },
                { level: 0.786, price: maxHigh - (diff * 0.786), text: "78.6%" },
                { level: 1, price: minLow, text: "100% (Low)" }
            ]
        };
    }
};
