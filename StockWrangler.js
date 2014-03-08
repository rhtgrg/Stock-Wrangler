// ==UserScript==
// @name       Stock Wrangler
// @namespace  http://rhtgrg.com
// @version    0.2
// @description  User-script that displays pertinent stock information on certain websites
// @match      https://www.google.com/finance*
// @match	   http://www.marketwatch.com/game/*
// @copyright  2014+, Rohit Garg
// @require http://code.jquery.com/jquery-latest.js
// ==/UserScript==

var StockWrangler = {
    init: function(){     
        // Go over the config and perform actions as needed
        $.each(StockWranglerConfig, function(index,config){
            // Check if the current config matches URL
            if(config.url.test(document.URL)){
                console.log(1111);
                $.each(config.actions, function(aindex,action){
                    // Select the items we will modify
                    $(action.select).each(function(i,v){
                        var ticker = action.ticker($(v));
                        var sentimentPromise = StockWrangler.fetchRawSentiment(ticker, action.delay);
                        var ratingPromise = StockWrangler.fetchRawRating(ticker, action.delay);
                        
                        $.when(ratingPromise, sentimentPromise).done(function(rating, sentiment){
                            console.log(sentiment);
                            var finalText = action.after.replace("{rating}", rating.value+"% "+rating.trend);
                            finalText = finalText.replace("{sentiment}", sentiment.value + "% " + sentiment.trend);
                            $(v).after(finalText);
                            if(typeof action.before !== "undefined"){
                                $(v).before(action.before.replace("{ticker}",ticker));
                            }
                        });
                    });
                });
            }
        });
        
        // Add CSS styling
        StockWrangler.addGlobalStyle(".sw-table-rating {font-weight: bold;}");
        StockWrangler.addGlobalStyle(".sw-table-sentiment {float: right; font-weight: bold; color: blue;}");
        StockWrangler.addGlobalStyle(".sw-graph-rating {font-weight: bold; margin-left: 5px;}");
        StockWrangler.addGlobalStyle(".sw-graph-sentiment {font-weight: bold; color: blue; margin-left: 5px;}");
    },
    addGlobalStyle: function(css) {
        var head, style;
        head = document.getElementsByTagName('head')[0];
        if (!head) { return; }
        style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    },
    fetchRawSentiment: function(ticker, delay){
        var dfd = new $.Deferred();
        var result = {value: 0, trend: ""};
        var sen_number_re = /&quot;sen_number&quot;:\s+(\d+)/;
        var sen_text_re = /&quot;sen_text&quot;:\s.+?;(\w+)/;
        setTimeout(function(){
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
        }, delay);
        return dfd.promise();
    },
    fetchRawRating: function(ticker, delay){
        var dfd = new $.Deferred();
        var result = {value: 0, trend: ""};
        var re = /Overall Average:[^\d]+(\d+).+?([\w\s]+)/m;
        setTimeout(function(){
            GM_xmlhttpRequest({
                method: "GET",
                headers: {
                    "Referer": "http://www.barchart.com/quotes/stocks/"+ticker
                },
                url: "http://www.barchart.com/opinions/stocks/"+ticker,
                onload: function(response) {
                    var opinion = re.exec(response.responseText);
                    if(opinion){
                        result.value = opinion[1];
                        result.trend = opinion[2];
                    }
                    dfd.resolve(result);
                }
            }); 
        }, delay);
        return dfd.promise();
    }
};

/*
 * TODO: Use this dictionary to define what needs to be done
 */
var StockWranglerConfig = [
    {
        url: /https:\/\/www.google.com\/finance.*/,
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