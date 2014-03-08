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
        /*
        var re = /^http:\/\/www\.marketwatch\.com/;
        if(re.test(document.URL)){
            StockWranglerMarketWatch.init();
        } else {
            StockWranglerGoogle.init();
        }*/
        
        // Go over the config and perform actions as needed
        $.each(StockWranglerConfig, function(index,config){
            // Check if the current config matches URL
            if(config.url.test(document.URL)){
                console.log(1111);
                $.each(config.actions, function(aindex,action){
                	// Select the items we will modify
                    $(action.select).each(function(i,v){
                    	var ticker = action.ticker($(v));
                        var sentimentPromise = StockWrangler.fetchRawSentiment(ticker);
                        var ratingPromise = StockWrangler.fetchRawRating(ticker);

                        $.when(ratingPromise, sentimentPromise).done(function(rating, sentiment){
                            console.log(rating);console.log(sentiment);
                            var finalText = action.after.replace("{rating}", rating.value+"%");
                            finalText.replace("{sentiment}", sentiment.value + "% " + sentiment.trend);
                            $(v).after(finalText);
                        });
                    });
                });
            }
        });
        
        // Add CSS styling
        StockWrangler.addGlobalStyle("");
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
    fetchRawSentiment: function(ticker){
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
        var dfd = new $.Deferred();
        var result = {value: 0, trend: ""};
        var re = /Overall Average:[^\d]+(\d+)(.+\n){2}.+?>((\s?\w)+)/m;
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
                    result.trend = opinion[3];
                }
                dfd.resolve(result);
            }
        }); 
        return dfd.promise();
    },
    fetchSentiment: function($container, ticker, numberOnly){
        var sen_number_re = /&quot;sen_number&quot;:\s+(\d+)/;
        var sen_text_re = /&quot;sen_text&quot;:\s.+?;(\w+)/;
        GM_xmlhttpRequest({
            method: "GET",
            headers: {
                "Referer": "http://www.barchart.com/quotes/stocks/"+ticker
            },
            url: "http://insights.themarketiq.com/chart/?symbol="+ticker,
            onload: function(response) {
                var result;
                var sen_number = sen_number_re.exec(response.responseText);
                var sen_text = sen_text_re.exec(response.responseText);
                sen_number = sen_number ? sen_number[1]+"%" : "?";
                sen_text = sen_text ? sen_text[1] : "";
                result = (typeof numberOnly !== "undefined" && numberOnly && /\d+/.exec(sen_number)) ? /\d+/.exec(sen_number)[0] : sen_number+' '+sen_text;
                $container.append(result);
            }
        });
    },
    fetchRating: function($container, ticker, numberOnly){
        var re = /<b>Overall Average:.*?<\/b>/m;
        GM_xmlhttpRequest({
            method: "GET",
            headers: {
                "Referer": "http://www.barchart.com/quotes/stocks/"+ticker
            },
            url: "http://www.barchart.com/opinions/stocks/"+ticker,
            onload: function(response) {
                var opinion = re.exec(response.responseText);
                if(opinion){
                    opinion = opinion[0].replace("Overall Average:","");
                    result = (typeof numberOnly !== "undefined" && numberOnly) ? /\d+/.exec(opinion)[0] : opinion;
                    $container.append(result);
                }
            }
        }); 
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
                ticker: function($container) {return /:([^&]+)/.exec($container.attr('href'))[1];},
                after: '<div class="wrangler_nums">{rating}</div><div style="float:right; font-weight: bold;">{sentiment}</div>'
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

/*
 * Marketwatch game specific actions
 */
var StockWranglerMarketWatch = {
    init: function(){
        $("[href^='/investing/stock/']").each(function(i,v){
            var ticker = $(v).text();
            var $ratingContainer = $('<div style="font-weight: bold"></div>');
            var $sentimentContainer = $('<div style="color:blue; font-weight: bold"></div>');
            StockWrangler.fetchSentiment($sentimentContainer, ticker);
            StockWrangler.fetchRating($ratingContainer, ticker);
            $(v).append($sentimentContainer);
            $(v).append($ratingContainer);
        });
    }
}

/*
 * Google finance specific actions
 */
var StockWranglerGoogle = {
    stocks: [],
    init: function(){
        // Store the stock DOM
        StockWranglerGoogle.populateStocks();
        // Populate comma separated list
        StockWranglerGoogle.commafy();
        // Change click functionality
        StockWranglerGoogle.activateClickActions();
        // Get stock ratings
        StockWranglerGoogle.getStockRatings();
        // Get social sentiment
        StockWranglerGoogle.getSocialSentiment();
        // Get yahoo chart
        StockWranglerGoogle.getYahooChart();
        // Generate chart links
        StockWranglerGoogle.addChartLinkRows();
    },
    populateStocks: function(){
        $("#main [href^='/finance?q=']").each(function(i,v){
            StockWranglerGoogle.stocks.push($(v));
        });
        
        // DEBUG: Only have one stock
        // StockWranglerGoogle.stocks = [StockWranglerGoogle.stocks[0]];
    },
    activateClickActions: function(){
        document.oncontextmenu = function() {return false;};
        
        $(document).mousedown(function(e){ 
            if( e.button == 2 ) { 
                $("#swrangler").text("");
                return false; 
            } 
            return true; 
        });
        
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            var $botan = $('<div style="display: block; float:right; width: 15px; height: 15px; background: green; margin-left: 5px;"></div>');
            $botan.click(function(event){
                $("#swrangler").text($("#swrangler").text()+","+ticker);
            });
            $v.before($botan);
        });
    },
    commafy: function(){
        var final = "";
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            final = final + ticker + ",";
        });
        $("#main tr:first-child td").append("<div id='swrangler'>"+final.substr(0,final.length-1)+"</div>");
    },
    getStockRatings: function(){
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            var $container = $('<div class="wrangler_nums"></div>');
            StockWrangler.fetchRating($container, ticker);
            $v.after($container);
        });
        
        // Also get stock ratings for graph tickers (needs timeout because graph loads late)
        setTimeout(function(){
            $("label.gf-chart-ticker").each(function(i,v){
                var ticker = $(v).text();
                if(ticker.match(/\./) == null){
                    StockWrangler.fetchRating($(v), ticker);
                }
            });
        }, 1500);
        
        // Also get stock ratings for tables (needs timeout because table loads late)
        setTimeout(function(){
            $("#pf-view-table [href^='/finance?q=']:odd").each(function(i,v){
                var ticker = /:([^&]+)/.exec($(v).attr('href'))[1];
                var $container = $('<div style="margin-left: 5px; font-weight: bold;"></div>');
                StockWrangler.fetchRating($container, ticker, true);
                $(v).after($container);
            });
        }, 1500);
    },
    getSocialSentiment: function(){
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            var $container = $('<div style="float:right; font-weight: bold;"></div>');
            StockWrangler.fetchSentiment($container, ticker);
            $v.siblings(".wrangler_nums").append($container);
        });
        
        // Also get sentiments for graph tickers (needs timeout because graph loads late)
        setTimeout(function(){
            $("label.gf-chart-ticker").each(function(i,v){
                var ticker = $(v).text();
                var $container = $('<b class="sentiment" style="color: blue"></b>');
                $(v).append($container);
                if(ticker.match(/\./) == null){
                    StockWrangler.fetchSentiment($container, ticker);
                }
            });
        }, 1500);
        
        // Also get sentiments for tables (needs timeout because table loads late)
        setTimeout(function(){
            $("#pf-view-table [href^='/finance?q=']:odd").each(function(i,v){
                var ticker = /:([^&]+)/.exec($(v).attr('href'))[1];
                var $container = $('<div style="margin-left: 5px;></div>');
                StockWrangler.fetchSentiment($container, ticker, true);
                $(v).after($container);
            });
        }, 1500);
    },
    getYahooChart: function(){
        var re = /<b>Overall Average:.*?<\/b>/m;
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            $v.before('<img src="http://ichart.finance.yahoo.com/h?s='+ticker+'&amp;lang=en-US&amp;region=us" style="float: left; margin: 10px;" alt="Sparkline Chart"/>');        
        });   
    },
    addChartLinkRows: function(){
        var tally = "";
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            tally = tally + ticker + "%2C";
            // Every fifth row
            if((i+1)%5 == 0){
                $v.parents("tr").after("<tr><td colspan='8'><a href='https://www.google.com/finance?q="+tally+"'>Link to Chart</a></td></tr>");
                tally = "";
            }
        });
    }
}

// Begin
$(function(){
    StockWrangler.init();
});