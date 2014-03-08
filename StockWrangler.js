// ==UserScript==
// @name       Stock Wrangler
// @namespace  http://rhtgrg.com
// @version    0.3
// @description  User-script that displays pertinent stock information on certain websites
// @match      https://www.google.com/finance*
// @match	   http://www.marketwatch.com/game/*
// @match      https://client.schwab.com/*
// @copyright  2014+, Rohit Garg
// @updateURL  https://raw.github.com/rhtgrg/Stock-Wrangler/master/StockWrangler.js
// @require http://code.jquery.com/jquery-latest.js
// @require http://cdn.jsdelivr.net/qtip2/2.2.0/jquery.qtip.min.js
// ==/UserScript==

/* Debug method */
var debugLoggingEnabled = true;
var debugMessage = debugLoggingEnabled ? function(msg){console.log(msg);} : function(msg){};

/* Namespace singleton */
var StockWrangler = {
    init: function(){
        // Go over the config and perform actions as needed
        $.each(StockWranglerConfig, function(index,config){
            // Check if the current config matches URL
            if(config.url.test(document.URL)){
                debugMessage("URL matched");
                StockWrangler.addGlobalStyle(config.css);
                $.each(config.actions, function(aindex,action){
                    debugMessage("Matching with: "+action.select);
                    // Select the items we will modify (after delay)
                    setTimeout(function(){
                        $(action.select).each(function(i,v){
                            var ticker = action.ticker($(v));
                            if(/[0-9a-z.]/.test(ticker)) return; // Not a real stock ticker, has lowercase or numbers or dot
                            debugMessage("Processing element match #"+i+" ("+ticker+")");
                            
                            var sentimentPromise = StockWrangler.fetchRawSentiment(ticker, action.delay);
                            var ratingPromise = StockWrangler.fetchRawRating(ticker, action.delay);
                            
                            $.when(ratingPromise, sentimentPromise).done(function(rating, sentiment){
                                debugMessage(rating);
                                debugMessage(sentiment);
                                if(typeof action.before !== "undefined"){
                                    $(v).before(action.before.replace("{ticker}",ticker));
                                }
                                if(typeof action.after !== "undefined"){
                                    var finalText = action.after;
                                    // Insert widget
                                    finalText = finalText.replace("{widget}", StockWrangler.widget);
                                    // Inject ticker
                                    finalText = finalText.replace(/{ticker}/g, ticker);
                                    // Inject ratings (including a tooltip if possible)
                                    if(typeof rating.avg !== "undefined"){
                                        // If average exists, others do too
                                        finalText = finalText.replace("{rating.avg}", rating.avg.value+"% "+rating.avg.trend);
                                        finalText = finalText.replace("{rating.st}", '<span style="'+
                                                                                     StockWrangler.getStyle(rating.st.value, rating.st.trend)+
                                                                                     '">'+rating.st.value+'</span>');
                                        finalText = finalText.replace("{rating.mt}", '<span style="'+
                                                                                     StockWrangler.getStyle(rating.mt.value, rating.mt.trend)+
                                                                                     '">'+rating.mt.value+'</span>');
                                        finalText = finalText.replace("{rating.lt}", '<span style="'+
                                                                                     StockWrangler.getStyle(rating.lt.value, rating.lt.trend)+
                                                                                     '">'+rating.lt.value+'</span>');
                                    }
                                    finalText = finalText.replace("{sentiment}", '<span style="'+
                                                                                 StockWrangler.getStyle(sentiment.value, sentiment.trend)+
                                                                                 '">'+sentiment.value + "% " + sentiment.trend+'</span>');
                                    $(v).after(finalText);
                                    // Activate shopping cart / clipboard functionality
                                    $(v).parent().find(".fa-shopping-cart").click(function(event){
                                        StockWranglerClipboard.toggleTicker(ticker);
                                        $(event.target).css("color", "blue");
                                    });
                                }
                            });
                        });
                    }, action.delay);
                });
            }
        });
    },
    addGlobalStyle: function(css) {
        if(/http.*/.test(css)){
            $("head").append('<link rel="stylesheet" type="text/css" href="'+css+'" />');
        } else {
            $("head").append('<style type="text/css">'+css+'</style>');
        }
    },
    loadCSS: function() {
        // Add styling
        StockWrangler.addGlobalStyle("https://cdn.jsdelivr.net/qtip2/2.2.0/jquery.qtip.min.css");
        StockWrangler.addGlobalStyle("https://netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.css");
        // TODO: Find non-webkit alternative to inline the table
        StockWrangler.addGlobalStyle(".sw-widget {font-size: 10px; font-family: 'Monaco','Bitstream Vera Sans Mono','Courier New',monospace; display: -webkit-inline-box; vertical-align: middle; margin-left: 10px;}");
        StockWrangler.addGlobalStyle(".sw-widget td {border: 1px solid #999; padding: 1px 5px; text-align: center}");
        StockWrangler.addGlobalStyle(".sw-widget a {cursor:pointer; color:rgb(147, 150, 182); font-size: 11px;}");
    },
    fetchRawSentiment: function(ticker){
        debugMessage("Fetching sentiment");
        var dfd = new $.Deferred();
        var result = {value: 0, trend: ""};
        var sen_number_re = /&quot;sen_number&quot;:\s+(\d+)/;
        var sen_text_re = /&quot;sen_text&quot;:\s.+?;(\w+)/;
        
        GM_xmlhttpRequest({
            method: "GET",
            headers: {
                "Referer": "http://www.barchart.com/quotes/stocks/"+ticker
            },
            url: "http://insights.themarketiq.com/chart/?symbol="+ticker,
            onload: function(response) {
                var sen_number = sen_number_re.exec(response.responseText);
                var sen_text = sen_text_re.exec(response.responseText);
                if(sen_number){
                    result.value = sen_number[1];
                }
                if(sen_text){
                    result.trend = sen_text[1];
                }
                dfd.resolve(result);
            }
        });
        
        return dfd.promise();
    },
    fetchRawRating: function(ticker){
        debugMessage("Fetching rating");
        var dfd = new $.Deferred();
        // Value is the average, st, lt, and mt are term based
        var result = {};
        var regex = {
            avg: /Overall Average:[^\d]+(\d+).+?([\w\s]+)/m,
            st: /Short Term Indicators Average:[^\d]+(\d+).+?([\w\s]+)/m,
            mt: /Medium Term Indicators Average:[^\d]+(\d+).+?([\w\s]+)/m,
            lt: /Long Term Indicators Average:[^\d]+(\d+).+?([\w\s]+)/m
        };
        GM_xmlhttpRequest({
            method: "GET",
            headers: {
                "Referer": "http://www.barchart.com/quotes/stocks/"+ticker
            },
            url: "http://www.barchart.com/opinions/stocks/"+ticker,
            onload: function(response) {
                $.each(regex, function(key, val){
                    var output = val.exec(response.responseText);
                    if(output){
                        result[key] = {
                            value: output[1],
                            trend: output[2]
                        }
                    }
                });
                
                dfd.resolve(result);
            }
        }); 
        return dfd.promise();
    },
    // Get colors based on value and trend
    getStyle: function(value, trend){
        if(/.*(Buy|Bullish).*/.test(trend)){
            return "color: green;";
        } else if(/.*Neutral.*/.test(trend)){
            return "";
        }
        return "color: red;";
    },
    // Define the little widget that will show values succintly
    widget: '<table class="sw-widget"><tr><td colspan="2">{rating.st}</td><td colspan="2">{rating.mt}</td><td colspan="2">{rating.lt}</td><td><a href="https://www.google.com/finance?q={ticker}"><i class="fa fa-eye"></i></a></td></tr><tr><td colspan="3">{rating.avg}</td><td colspan="3">{sentiment}</td><td><i class="fa fa-shopping-cart"></i></td></tr></table>'
};

/*
 * TODO: Use this dictionary to define what needs to be done
 */
var StockWranglerConfig = [
    {
        url: /https?:\/\/www.google.com\/finance.*/,
        css: ".sw-table-rating {font-weight: bold;} \
              .sw-table-sentiment {float: right; font-weight: bold; color: blue;} \
              .sw-graph-rating {font-weight: bold; margin-left: 5px;} \
              .sw-graph-sentiment {font-weight: bold; color: blue; margin-left: 5px;}",
        actions: [
            {
                select: '#main [href^="/finance?q="]',
                delay: 0,
                ticker: function($container) {return /:([^&]+)/.exec($container.attr('href'))[1];},
                after: '{widget}',
                before: '<img src="http://ichart.finance.yahoo.com/h?s={ticker}&amp;lang=en-US&amp;region=us" style="float: left; margin: 10px;" alt="Sparkline Chart"/>'
            },
            {
                select: 'label.gf-chart-ticker',
                delay: 1500,
                // TODO: Find a better place to adjust height
                ticker: function($container) {$("#compare-bar").css("height","auto"); return $container.text();},
                after: '{widget}'
            },
            {
                select: '.gf-table [href^="/finance?q="]:odd',
                delay: 1500,
                ticker: function($container) {return $container.text();},
                after: '{widget}'
            }
        ]
    },
    {
        url: /http:\/\/www.marketwatch.com\/game.*/,
        actions: [
            {
                select: '[href^="/investing/stock/"]',
                delay: 0,
                ticker: function($container) {return $container.text();},
                after: '{widget}'
            }
        ]
    },
    {
        url: /https:\/\/client.schwab.com\/Accounts\/.*/,
        actions: [
            {
                select: '[href^="/SymbolRouting.aspx?Symbol="]',
                delay: 0,
                ticker: function($container) {return $container.text().trim();},
                after: '{widget}'
            }
        ]
    }
];

/*
 * TODO: Use with above dictionary to prevent over-fetching
 */
var StockWranglerCache = {
    SYM: {
        rating: 0,
        sentiment: 0
    }
};

var StockWranglerClipboard = {
    tickers: [],
    toggleTicker: function(ticker) {
        if(StockWranglerClipboard.tickers.indexOf(ticker) == -1){
            StockWranglerClipboard.tickers.push(ticker);
        }
        GM_setClipboard(StockWranglerClipboard.tickers.join());
    }
}

// Begin
$(function(){
    StockWrangler.loadCSS();
    StockWrangler.init();
});