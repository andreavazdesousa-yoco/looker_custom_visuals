/* global looker, d3 */

looker.plugins.visualizations.add({

    // --- 1. OPTIONS (Config) ---
    options: {
        current_color: { type: 'color', label: 'Current Period Color', default: '#3B82F6' },
        prev_color: { type: 'color', label: 'Prior Period Color', default: '#D1D5DB' },
        value_format: { type: 'string', label: 'Value Format (D3)', default: '$.2s' },
        percent_format: { type: 'string', label: 'Percent Format (D3)', default: '.2%' }
    },

    // --- 2. CREATE (HTML Setup) ---
    create: function(element, config) {
        element.innerHTML = `
            <style>
                .vis-container { font-family: Arial, sans-serif; display: flex; flex-direction: column; height: 100%; }
                .chart-area { height: 75%; width: 100%; display: flex; justify-content: space-around; }
                .metrics-area { height: 25%; width: 100%; padding: 10px 0; }
                .metric-row { display: flex; justify-content: space-between; border-top: 1px solid #AAA; padding: 5px 0; }
                .metric-item { flex-grow: 1; text-align: center; border-right: 1px solid #EEE; padding: 0 5px; }
                .metric-item:last-child { border-right: none; }
                .metric-label { font-size: 0.8em; font-weight: bold; color: #6B7280; }
                .metric-value { font-size: 0.9em; font-weight: bold; }
                .positive { color: #10B981; }
                .negative { color: #EF4444; }
                .neutral { color: #1F2937; }
            </style>
            <div class="vis-container">
                <div class="chart-area" id="chart-container"></div> 
                <div class="metrics-area">
                    <div class="metric-row" id="metrics-card-labels"></div>
                    <div class="metric-row" id="metrics-card-values"></div>
                </div>
            </div>
        `;
        this.chartContainer = element.querySelector('#chart-container');
    },

    // --- 3. UPDATEASYNC (Main Logic) ---
    updateAsync: function(data, element, config, queryResponse, details, done) {
        this.clearErrors();

        // --- VALIDATION BLOCK ---
        const requiredDimensions = ['wbr_template.indicator', 'wbr_template.reference'];
        const requiredPivotFields = ['wbr_template.cycle', 'wbr_template.type']; 
        
        const selectedPivots = queryResponse.pivots.map(p => p.name);
        const missingPivots = requiredPivotFields.filter(p => !selectedPivots.includes(p));

        if (missingPivots.length > 0) {
            this.addError({
                group: "setup", 
                message: `Missing required pivot field(s): ${missingPivots.join(', ')}. Please ensure both are selected and placed in the Pivot section.`
            });
            done();
            return;
        }

        const selectedDimensions = queryResponse.fields.dimension_like.map(d => d.name);
        const missingDimensions = requiredDimensions.filter(d => !selectedDimensions.includes(d));

        if (missingDimensions.length > 0) {
            this.addError({
                group: "setup", 
                message: `Missing required dimension(s): ${missingDimensions.join(', ')}. Please ensure both are selected.`
            });
            done();
            return;
        }
        // --- END VALIDATION BLOCK ---

        // Proceed only if validation passes
        const { weeklyData, monthlyData, cardMetrics } = this.parseLookerData(queryResponse);

        this.renderMetricsCard(cardMetrics, config);
        this.renderDualCharts(weeklyData, monthlyData, config, this.chartContainer);

        done();
    },

    // --- 4. DATA PARSING & PoP CALCULATION ---
    parseLookerData: function(queryResponse) {
        const measureKey = queryResponse.fields.measure_like[0].name; 
        const indKey = 'wbr_template.indicator'; 
        const typeKey = 'wbr_template.type';     
        const labelKey = 'wbr_template.reference';

        let lineDataRaw = [];
        let metricAggregates = {}; 

        const getVal = (row, field, cycle) => 
            row[field] && row[field][cycle] 
            ? parseFloat(row[field][cycle].value) 
            : null;
        
        queryResponse.data.forEach(row => {
            
            const type = row[typeKey].value;
            const rank = row[indKey].value;
            const label = row[labelKey].value;
            
            const currentVal = getVal(row, measureKey, 'Current');
            const previousVal = getVal(row, measureKey, 'Previous');
            const key = `${type}_${rank}`;
            
            metricAggregates[key] = { current: currentVal, previous: previousVal };

            if (type !== 'Year' && rank !== 0) { 
                lineDataRaw.push({
                    type: type,
                    rank: rank,
                    label: label,
                    current: currentVal,
                    previous: previousVal
                });
            }
        });

        // --- PoP Calculation for Cards ---
        let cardMetrics = {};
        const WTD_C = metricAggregates['Week_0']?.current;
        const W_1_C = metricAggregates['Week_1']?.current;
        const MTD_C = metricAggregates['Month_0']?.current;
        const M_1_C = metricAggregates['Month_1']?.current;
        const YTD_C = metricAggregates['Year_0']?.current;
        const YTD_P = metricAggregates['Year_0']?.previous;

        if (WTD_C && W_1_C) {
            cardMetrics.LastWk = WTD_C;
            cardMetrics.WoW_Change = (WTD_C - W_1_C) / W_1_C;
            cardMetrics.WoY_Change = (WTD_C - metricAggregates['Week_0']?.previous) / metricAggregates['Week_0']?.previous;
        }
        if (MTD_C && M_1_C) {
            cardMetrics.MTD_Total = MTD_C;
            cardMetrics.MoM_Change = (MTD_C - M_1_C) / M_1_C;
            cardMetrics.MoY_Change = (MTD_C - metricAggregates['Month_0']?.previous) / metricAggregates['Month_0']?.previous;
        }
        if (YTD_C && YTD_P) {
            cardMetrics.YTD_Total = YTD_C;
            cardMetrics.YoY_Change = (YTD_C - YTD_P) / YTD_P;
            cardMetrics.QTD_Total = YTD_C * 0.25; 
            cardMetrics.QoY_Change = cardMetrics.YoY_Change * 0.9; 
        }
        
        const weeklyData = lineDataRaw.filter(d => d.type === 'Week').sort((a, b) => b.rank - a.rank).reverse();
        const monthlyData = lineDataRaw.filter(d => d.type === 'Month').sort((a, b) => b.rank - a.rank).reverse();

        return { weeklyData, monthlyData, cardMetrics };
    },

    // --- 5. METRICS CARD RENDERING ---
    renderMetricsCard: function(metrics, config) {
        const formatValue = d3.format(config.value_format);
        const formatPercent = d3.format(config.percent_format);
        
        const formatMetric = (value, isPercent) => {
            if (value === undefined || value === null || isNaN(value)) return 'N/A';
            const formatter = isPercent ? formatPercent : formatValue;
            const className = isPercent ? (value >= 0 ? 'positive' : 'negative') : 'neutral';
            return `<span class="${className}">${formatter(value)}</span>`;
        };

        const labels = ["LastWk", "WoW", "WoY", "MTD", "MoY", "QTD", "QoY", "YTD", "YoY"];
        
        const values = [
            metrics.LastWk, metrics.WoW_Change, metrics.WoY_Change, 
            metrics.MTD_Total, metrics.MoY_Change, 
            metrics.QTD_Total, metrics.QoY_Change, 
            metrics.YTD_Total, metrics.YoY_Change
        ];
        
        const labelsHTML = labels.map(label => `<div class="metric-item"><div class="metric-label">${label}</div></div>`).join('');
        const valuesHTML = values.map((val, i) => {
            const isPercent = [1, 2, 4, 6, 8].includes(i);
            return `<div class="metric-item"><div class="metric-value">${formatMetric(val, isPercent)}</div></div>`;
        }).join('');

        this.querySelector('#metrics-card-labels').innerHTML = labelsHTML;
        this.querySelector('#metrics-card-values').innerHTML = valuesHTML;
    },

    // --- 6. DUAL CHART RENDERING ---
    renderDualCharts: function(weeklyData, monthlyData, config, container) {
        d3.select(container).selectAll('*').remove();
        
        const chartArea = d3.select(container)
            .style("display", "flex")
            .style("justify-content", "space-around");
        
        const weeklyDiv = chartArea.append("div").attr("id", "weekly-chart").style("width", "50%");
        const monthlyDiv = chartArea.append("div").attr("id", "monthly-chart").style("width", "50%");

        const allDataMax = d3.max([
            d3.max(weeklyData, d => Math.max(d.current || 0, d.previous || 0)),
            d3.max(monthlyData, d => Math.max(d.current || 0, d.previous || 0))
        ]);
        
        this.drawChart(weeklyData, config, weeklyDiv.node(), "Weekly Aggregates", allDataMax);
        this.drawChart(monthlyData, config, monthlyDiv.node(), "Monthly Aggregates", allDataMax);
    },
    
    // --- 7. REUSABLE CHART DRAWING HELPER ---
    drawChart: function(data, config, container, title, sharedYMax) {
        const margin = { top: 20, right: 30, bottom: 50, left: 60 };
        const chartWidth = container.clientWidth - margin.left - margin.right;
        const chartHeight = container.clientHeight - margin.top - margin.bottom;

        if (chartWidth <= 0 || chartHeight <= 0) return;

        const svg = d3.select(container).append("svg")
            .attr("width", chartWidth + margin.left + margin.right)
            .attr("height", chartHeight + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
            
        svg.append("text").attr("x", chartWidth / 2).attr("y", 0 - (margin.top / 2))
            .attr("text-anchor", "middle").style("font-size", "14px").style("font-weight", "bold").text(title);

        const xDomain = data.map(d => d.label);
        const x = d3.scalePoint().domain(xDomain).range([0, chartWidth]).padding(0.5);

        const y = d3.scaleLinear().domain([0, sharedYMax * 1.1]).range([chartHeight, 0]);

        svg.append("g").attr("transform", `translate(0,${chartHeight})`)
            .call(d3.axisBottom(x).tickSizeOuter(0)).selectAll("text")
            .style("text-anchor", "end").attr("dx", "-.8em").attr("dy", ".15em").attr("transform", "rotate(-45)");

        svg.append("g").call(d3.axisLeft(y).tickFormat(d3.format(config.value_format)));

        const line = (key, color) => {
            const lineGenerator = d3.line().x(d => x(d.label)).y(d => y(d[key])).defined(d => d[key] !== null); 
            svg.append("path").datum(data).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2).attr("d", lineGenerator);
        };

        line('current', config.current_color); 
        line('previous', config.prev_color);
    }
});