// ==UserScript==
// @name       Stock Wrangler
// @namespace  http://rhtgrg.com
// @version    0.2
// @description  User-script that displays pertinent stock information on certain websites
// @match      https://www.google.com/finance?*
// @match	   http://www.marketwatch.com/game/*
// @copyright  2014+, Rohit Garg
// @require http://code.jquery.com/jquery-latest.js
// ==/UserScript==

/*
 * This script presumes that we are starting from a Google finance page as per usual
 * 
 * Steps:
 * - Comma separated list: Puts a comma separated list at the top
 * - Stock rating: Pulls the stock rating (buy, sell, hold) from barchart.com
 * - Yahoo Chart
 * - Chart link: This page links to a chart for 'n' stocks, where 'n' is the maximum
 *   supported number (by Google stock charts)
 */
var StockWrangler = {
    init: function(){
        var re = /^http:\/\/www\.marketwatch\.com/;
        if(re.test(document.URL)){
            StockWranglerMarketWatch.init();
        } else {
            StockWranglerGoogle.init();
        }
    },
    fetchSentiment: function($container, ticker){
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
                sen_number = sen_number ? sen_number[1]+"%" : "?";
                sen_text = sen_text ? sen_text[1] : "";
                $container.append(sen_number+' '+sen_text);
            }
        });    
    },
    fetchRating: function($container, ticker){
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
                    $container.append(opinion[0].replace("Overall Average:",""));
                }
            }
        }); 
    }
};

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
    },
    getSocialSentiment: function(){
        $(StockWranglerGoogle.stocks).each(function(i,$v){
            var ticker = /:([^&]+)/.exec($v.attr('href'))[1];
            var $container = $('<div style="float:right; font-weight: bold;"></div>');
            StockWrangler.fetchSentiment($container, ticker);
            $v.siblings(".wrangler_nums").append($container);
        });
        
        // Also get stock ratings for graph tickers (needs timeout because graph loads late)
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