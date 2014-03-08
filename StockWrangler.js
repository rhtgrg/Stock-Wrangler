// ==UserScript==
// @name       Stock Wrangler
// @namespace  http://rhtgrg.com
// @version    0.2
// @description  User-script that displays pertinent stock information on certain websites
// @match      https://www.google.com/finance*
// @match	   http://www.marketwatch.com/game/*
// @copyright  2014+, Rohit Garg
// @require http://code.jquery.com/jquery-latest.js
// @require http://cdn.jsdelivr.net/qtip2/2.2.0/jquery.qtip.min.js
// ==/UserScript==

/* Debug method */
var debugLoggingEnabled = false;
var debugMessage = debugLoggingEnabled ? function(msg){console.log(msg);} : function(msg){};

/* Namespace singleton */
var StockWrangler = {
    init: function(){     
        StockWrangler.addGlobalStyle("https://cdn.jsdelivr.net/qtip2/2.2.0/jquery.qtip.min.css");
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
                            debugMessage("Processing element match #"+i);
                            var ticker = action.ticker($(v));
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
                                    // Inject ratings (including a tooltip if possible)
                                    if(typeof rating.avg !== "undefined"){
                                        finalText = finalText.replace("{rating}", rating.avg.value+"% "+rating.avg.trend);
                                        $(v).qtip({
                                            content: {
                                                title: "Rating Breakdown",
                                                text: "<b>Short term:</b> "+rating.st.value+"% "+rating.st.trend+"<br/><b>Mid term:</b> "+rating.mt.value+"% "+rating.mt.trend+"<br/><b>Long term:</b> "+rating.lt.value+"% "+rating.lt.trend
                                            },
                                            style: {classes: "qtip-blue"}
                                        });
                                    }
                                    finalText = finalText.replace("{sentiment}", sentiment.value + "% " + sentiment.trend);
                                    $(v).after(finalText);
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
    }
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
                after: '<div class="sw-table-sentiment">{sentiment}</div><div class="sw-table-rating">{rating}</div>',
                before: '<img src="http://ichart.finance.yahoo.com/h?s={ticker}&amp;lang=en-US&amp;region=us" style="float: left; margin: 10px;" alt="Sparkline Chart"/>'
            },
            {
                select: 'label.gf-chart-ticker',
                delay: 1500,
                ticker: function($container) {return $container.text();},
                after: '<span  class="sw-graph-rating">{rating}</span><span class="sw-graph-sentiment">{sentiment}</span>'
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
                    after: '<div style="font-weight: bold">{sentiment}</div><div style="color:blue; font-weight: bold">{rating}</div>',
                    before: '<img src="http://ichart.finance.yahoo.com/h?s={ticker}&amp;lang=en-US&amp;region=us" style="float: left; margin: 10px;" alt="Sparkline Chart"/>'
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

// Begin
$(function(){
    StockWrangler.init();
});