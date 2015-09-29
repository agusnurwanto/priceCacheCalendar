var Base = require('../Base');
var moment = require('moment');
var debug = require('debug')('raabbajam:priceCacheCalendar:lion');
var _ = require('lodash');
var db = require('../libs/db');
var priceScrapers = require('priceScraper');
var LionPriceScrapers = priceScrapers.lion;
var cheerio = require('cheerio');
var Promise = require('bluebird');

function init(dt, scrape, args) {
	this._super('lion', dt, scrape, args);
	this.parallel = true;
	this._this = args._this;
	this.resFlight = args.resFlight;
}

function getAllRoutes() {
	var _this = this;
	var routes = [];
	var $ = cheerio.load(_this._scrape);
	var rms = $('td[id^=RM]')
		.html();
	if (!rms)
		return false;

	function looper(dir) {
		function getRow(i) {
			return $('tr[id^=RM' + dir + '_C' + i + ']');
		}
		var rowId = 0;
		var row = getRow(rowId);
		if (!row)
			return false;
		do {
			row.each(function(i, tr) {
				var rm = $('td[id^=RM]', tr)
					.html();
				if (!rm)
					return true;
				var currentRoute = rm.match(/[A-Z]{6}/)[0].toLowerCase();
				if (routes.indexOf(currentRoute) === -1) {
					routes.push(currentRoute);
				}
			});
			rowId++;
			row = getRow(rowId);
		} while (row.length);
	}
	looper(0);
	looper(1);
	return routes;
}

function mergeCache() {
	var _this = this;
	var _cache = _this.cache;
	var lowestPrices = {};
	var $ = cheerio.load(_this._scrape);
	var rms = $('td[id^=RM]')
		.html();
	if (!rms)
		return false;

	function looper(dir) {
		function getRow(i) {
			return $('tr[id^=RM' + dir + '_C' + i + ']');
		}
		var realRoute = _this._dt.ori.toLowerCase() + _this._dt.dst.toLowerCase();
		var rowId = 0;
		var row = getRow(rowId);
		if (!row)
			return false;
		do {
			var lowestPriceRows = [];
			row.each(function(i, tr) {
				var rm = $('td[id^=RM]', tr)
					.html();
				if (!rm)
					return true;
				var currentRoute = rm.match(/[A-Z]{6}/)[0].toLowerCase();
				if (!_this.cache[currentRoute])
					return true;
				var flightCode = $(tr)
					.find('td')
					.eq(0)
					.text()
					.trim()
					.substr(0, 2)
					.toLowerCase();
				// get all radio
				$('td[id] input[type=radio][id]', tr)
					.each(function(i, radio) {
						var span = $(radio)
							.parent();
						var available = $('label', span)
							.text();
						var classCode = span.attr('title')
							.substr(0, 1)
							.toLowerCase();
						var cachePrice = (_cache[currentRoute] &&
							_cache[currentRoute][flightCode] &&
							_cache[currentRoute][flightCode][classCode]) || 0;
						cachePrice = Math.round(cachePrice / 10) * 10;
						// update lowest price
						// if seat still available
						// and,
						// 	either lowest price for this route still 0
						//  	or
						//  	seat price cheaper than lowest price
						//  	but not zero
						if (!!available && (!lowestPrices[currentRoute] || (lowestPrices[currentRoute] > cachePrice && !!cachePrice)))
							lowestPrices[currentRoute] = cachePrice;
						// if in 'span' there is no '.rp' class and cachePrice is not zero
						if (!!cachePrice && !$('.rp', span)
							.length)
							span.append('<span class="rp">rplion' + cachePrice + 'rplion</span>');
					});
				lowestPriceRows.push(lowestPrices[currentRoute]);
			});
			// if there is more than one flight in on one row
			if (row.length > 1 && lowestPriceRows.length > 1 && _.every(lowestPriceRows)) {
				var lowestPriceRow = lowestPriceRows.reduce(function(price, num) {
					return num + price;
				}, 0);
				if (!lowestPrices[realRoute] || lowestPriceRow < lowestPrices[realRoute]) {
					lowestPrices[realRoute] = lowestPriceRow;
					// console.log(lowestPrices[realRoute], lowestPriceRow);
				}
			}
			rowId++;
			row = getRow(rowId);
		} while (row.length);
	}
	looper(0);
	looper(1);
	this._scrape = '<body>' + $('body')
		.html() + '</body>';
	return lowestPrices;
}
/**
 * return an array of object with ori, dst, class and flight property
 * @param  {Object} row Row object
 * @return {Array}     An array of object with ori, dst, class and flight property
 */
function getCheapestInRow(rowAll) {
	var _this = this;
	var seatRequest = _this.paxNum || 1;
	var outs = [];
	var classes, ori, dst, flight, flights;
	classes = ori = dst = flight = flights = '';
	var transitCounter = 0;
	var transits = [];
	var realDst = _this._dt.dst;
	var realOri = _this._dt.ori;
	var RT = false;
	_.each(rowAll, function(row, idx) {
		if(row.RT){
			var data = JSON.parse(JSON.stringify(_this._dt));
			realDst = data.ori;
			realOri = data.dst;
			RT = true;
			return true;
		}
		var aClass = Object.keys(row)
			.filter(function(b) {
				return b.length === 1;
			});
		var available = false;
		_.forEachRight(aClass, function(_class) {
			var matchAvailable = row[_class];
			if (!!matchAvailable) {
				if (+matchAvailable >= seatRequest) {
					available = true;
					classes += _class;
					return false;
				}
			}
		});
		if(!available)
			return true;
		flight = row.aircraft.replace(/\ /g, '-').toLowerCase();
		var rute = row.hidden.match(/[A-Z]{6}/)[0] || '';
		var pipe = '';
		if(flights.length>=1)
			pipe = '|';
		flights += pipe+flight;
		ori = rute.substr(0, 3);
		dst = rute.substr(3, 3);
		if (!rowAll[idx+1] 
			|| (rowAll[idx+1] && (!rowAll[idx+1].connection || rowAll[idx+1].connection==0))){
			if(rowAll[idx].connection!=0 && flights.indexOf('|')=='-1'){
				classes = flights = '';
				transitCounter = 0;
				transits = [];
				return true;
			}
			if(RT){
				out = {
					ori: ori,
					dst: realDst,
					flight: flights,
					class: classes,
				};
			}else{
				out = {
					ori: realOri,
					dst: dst,
					flight: flights,
					class: classes,
				};
			}
			if (out.class.length === out.flight.split('|').length)
				outs.push(out);
			classes = flights = '';
			transitCounter = 0;
			transits = [];
		} else {
			transits[transitCounter++] = dst;
		}
	});
	/*throw('tes');*/
	debug('outs', outs);
	return outs;
}

/**
 * Generate data to scrape from id
 * @param  {String} id String id from database
 * @return {Object}    Object data for scrape
 */
function generateData(ids) {
	var dataAll = [];
	for(var i in ids){
		var id = ids[i];
		var _id = id.split('_');
		var cek_instant_id = _id[3] + '_' + _id[4];
		cek_instant_id = cek_instant_id.toUpperCase();
		var date = this._dt.dep_date;
		if(_id[1] == this._dt.ori.toLowerCase())
			date = this._dt.ret_date;
		var data = {
			ori: _id[0],
			dst: _id[1],
			airline: _id[2],
			flightCode: _id[3],
			classCode: _id[4],
			cek_instant: 1,
			cek_instant_id: cek_instant_id,
			dep_date: date,
			// dep_date      : moment().add(1, 'M').format('DD+MMM+YYYY'),
			rute: 'OW',
			dep_radio: cek_instant_id,
			action: 'price',
			xToken: this._dt.xToken,
		};
		for (var i = 5, j = 1, ln = _id.length; i < ln; i++, j++) {
			data['transit' + j] = _id[i];
		}
		dataAll.push(data);
	}
	return dataAll;
}

/**
 * Scrape lost data
 * @param  {String} id Data generated id to scrape
 * @return {Object}    Return cache data after scrape it
 */
function scrapeLostData(ids) {
	var _this = this;
	var dt = _this.generateData(ids);
    _this.modes = _this._this.defaultModes || ['100', '110', '111'];
	var options = {
		ids: dt,
		mode: _this.modes[0]
	};
	_this.oriData = JSON.parse(JSON.stringify(_this._dt));
	_this._this.data.query = dt[0];
    _this._this.data.query.rute = 'ow';
	_this.data = [];
	_this.data.query = this._dt;
	_this.allModes = [];
	_this.resultsPrice = [];
    _this._this.data.query.adult = options.mode[0];
    _this._this.data.query.child = options.mode[1];
    _this._this.data.query.infant = options.mode[2];
	return new Promise(function(resolve, reject){
		_this.getCache(options, 'idsDep', resolve);
	});
}

function getCache(options, note, resolve){
    var _this = this;
    _this.idsDep = [];
    _this.idsRet = [];
    for(var i in options.ids){
    	var id = options.ids[i];
    	if(id.ori.toLowerCase()==_this.oriData.ori.toLowerCase() || id.dst.toLowerCase()==_this.oriData.dst.toLowerCase()){
    		_this.idsDep.push(id);
    	}else{
    		_this.idsRet.push(id);
    	}
    }
    var that = _this._this;
    _this.allModes.push(options.mode);
    _this.relogModes = false;
    for(var i in _this.modes){
        if(!_this.allModes[i]){
            _this.relogModes = _this.modes[i];
            break;
        }
    }
    if(note=='idsRet'){
    	var newRute = _this.oriData.ori+'_'+_this.oriData.dst;
    	that.data.query.ori = newRute.split('_')[1];
    	that.data.query.dst = newRute.split('_')[0];
    	that.data.query.dep_date = _this.oriData.ret_date;
	    if(_this.idsRet.length==0)
	        that.resFlight = true;
    }else{
	    if(_this.idsDep.length==0)
	        that.resFlight = true;
    }
    debug(note, 'that.data.query', that.data.query, _this.relogModes, _this.modes, 'that.resFlight', that.resFlight);
    that.step1()
    .then(function(res){
        that.resFlight = res;
        var time = 0;
        var arrayPromise = _this[note].map(function (_dt) {
            return new Promise(function(resolve, reject){
            	setTimeout(function(){
            		resolve(_this.getPrice(_dt, that));
            	},time);
            	time = time+1000;
            });
        });
        Promise.all(arrayPromise)
        .then(function(res){
            that.resFlight = false;
            if(_this.relogModes){
                that.data.query.adult = _this.relogModes[0];
                that.data.query.child = _this.relogModes[1];
                that.data.query.infant = _this.relogModes[2];
                options.mode = _this.relogModes;
            	return _this.getCache(options, note, resolve); 
            }else{
            	if(note!='idsRet' && _this.oriData.rute.toLowerCase()=='rt'){
					_this.allModes = [];
                	options.mode = that.defaultModes[0];
	                that.data.query.adult = options.mode[0];
	                that.data.query.child = options.mode[1];
	                that.data.query.infant = options.mode[2];
            		return _this.getCache(options, 'idsRet', resolve);
            	}else{
            		_this._dt.ori = _this.oriData.ori;
    				_this._dt.dst = _this.oriData.dst;
            		return resolve();
            	}
            }
        })
        .catch(function(err){
            debug(err.stack);
            return resolve();
        })
    })
    .catch(function(err){
        debug(err.stack);
        return resolve();
    })
}

function getPrice(_dt, that){
    var _this = this;
    var that = _this._this;
    return new Promise(function(resl, rejc){
    	_dt.adult = that.data.query.adult;
    	_dt.child = that.data.query.child;
    	_dt.infant = that.data.query.infant;
        var _data = JSON.parse(JSON.stringify(_dt));
        that.step1Price(_data)
        .then(function(res){
            that.jsonPrice(res)
            .then(function(results){
                var _id = _data.ori+'_'+_data.dst+'_'+_data.airline+'_'+_data.dep_radio;
                if(!_this.resultsPrice[_id]){
                    _this.resultsPrice[_id] = [];
                }
                _this.resultsPrice[_id].push(results)
                if(!_this.relogModes){
                    _this.saveCache(_this.resultsPrice[_id], _dt, function(err, res){
                        return resl(res);
                    });
                }else{
                    return resl(results);
                }
            })
            .catch(function(err){
                debug(err.stack);
                return resl(err);
            })
        })
        .catch(function(err){
            debug(err.stack);
            return resl(err);
        })
    })
    .catch(function(err){
        debug(err.stack);
        return Promise.resolve(err);
    })
}

function calculateAdult(results) {
	debug(JSON.stringify(results));
    var adult = results[0][0].price.total.replace(/\,/g, '').replace(/\./g,'');
    return parseInt(adult);
}

function calculateChild(results) {
    var child = results[0][0].price.total.replace(/\,/g, '').replace(/\./g,'');
    return parseInt(child);
}

function calculateInfant(results) {
    var total_100 = results[0][0].price.total.replace(/\,/g, '').replace(/\./g,'');
    var total_101 = results[1][0].price.total.replace(/\,/g, '').replace(/\./g,'');
    return total_101-total_100;
}

function calculateBasic(results) {
    var basic = results[0][0].price.published_fare.replace(/\,/g, '').replace(/\./g,'');
    return parseInt(basic);
}

/**
 * Merge json data with cheapest data from db
 * @param  {Object} json JSON formatted of scraped data
 * @return {Object}      JSON formatted of scraped data already merged with cache data
 */
function mergeCachePrices(json) {
	var seatRequest = this.paxNum || 1;
	var _json = _.cloneDeep(json);
	var _this = this;
	//debug('_this.cachePrices',JSON.stringify(_this.cachePrices));
	var departureCheapests = [];
	var returnCheapests = [];
	var lastDst, classes, ori, dst, flight, flights, realOri, realDst, rute, _rute;
	var _cheapest = {};
	classes = ori = dst = flight = flights = realOri = realDst = '';
	var transitCounter = 0;
	var transits = [];
	var rowIdx = 0;
	var realDst = _this._dt.dst;
	var realOri = _this._dt.ori;
	var allRow = _this.prepareRows(_json);
	var RT = false;
	_.each(allRow[0], function(row, idx) {
		if(row.RT){
			debug('mergeCachePrices rute is RT');
			var data = JSON.parse(JSON.stringify(_this._dt));
			realDst = data.ori;
			realOri = data.dst;
			RT = true;
			rowIdx = 0;
			return true;
		}
		var aClass = Object.keys(row)
			.filter(function(b) {
				return b.length === 1;
			});
		
		var format = ['DDMMM', 'DMMM'];
		var format2 = ['DDMMMHHmm', 'DMMMHHmm'];
		var hiddens = row.hidden.split('|');
		var date = moment(hiddens[3], format);
		var dayRangeForExpiredCheck = 2;
		var checkDate = moment()
			.add(dayRangeForExpiredCheck, 'day');
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		var depart = moment(hiddens[3] + hiddens[8], format2);
		var available = false;
		_.forEachRight(aClass, function(_class) {
			var matchAvailable = row[_class];
			if (!!matchAvailable) {
				if (+matchAvailable >= seatRequest) {
					if (_this.isBookable(depart)){
						available = true;
						classes += _class;
					}
					return false;
				}
			}
		});
		flight = row.aircraft.replace(/\ /g, '-').toLowerCase();
		var rute = row.hidden.match(/[A-Z]{6}/)[0] || '';
		var pipe = '';
		if(flights.length>=1)
			pipe = '|';
		flights += pipe+flight;
		ori = rute.substr(0, 3).toLowerCase();
		dst = rute.substr(3, 3).toLowerCase();
		if(RT)
			_rute = ori+realDst;
		else
			_rute = realOri+dst;
		if(!available){
			_this.cachePrices[_rute] = _this.cachePrices[_rute] || {};
			_this.cachePrices[_rute][flights] = _this.cachePrices[_rute][flights] || {};
			_cheapest = {
				class: 'Full'
			};
			if(RT)
				returnCheapests[rowIdx++] = _cheapest;
			else
				departureCheapests[rowIdx++] = _cheapest;
			classes = flights = '';
			transitCounter = 0;
			transits = [];
			_cheapest = {};
			return true;
		}
		if (!allRow[0][idx+1] 
			|| (allRow[0][idx+1] && (!allRow[0][idx+1].connection || allRow[0][idx+1].connection==0))){
			if(allRow[0][idx].connection!=0 && flights.indexOf('|')=='-1'){
				classes = flights = '';
				transitCounter = 0;
				transits = [];
				_cheapest = {};
				return true;
			}
			try {
				_cheapest.prices = _this.cachePrices[_rute][flights.toLowerCase()][classes.toLowerCase()];
				_cheapest.class = classes;
				_cheapest.flights = flights;
			} catch (e) {
				debug(e.stack, _rute, flights, classes);
				_this.cachePrices[_rute] = _this.cachePrices[_rute] || {};
				_this.cachePrices[_rute][flights] = _this.cachePrices[_rute][flights] || {};
				_cheapest = {
					class: 'Full'
				};
			}
			if(RT)
				returnCheapests[rowIdx++] = _cheapest;
			else
				departureCheapests[rowIdx++] = _cheapest;
			classes = flights = '';
			transitCounter = 0;
			transits = [];
			_cheapest = {};
		} else {
			transits[transitCounter++] = dst;
		}
	});
	_json.cachePrices = _this.cachePrices;
	_json[0].dep_cheapests = departureCheapests;
	if(_this._dt.rute.toLowerCase()=='rt' || _this.oriData && _this.oriData.rute=='rt'){
		_json[0].ret_cheapests = returnCheapests;
	}
	return _json;
}

/**
 * Preparing rows to be looped on process
 * @param  {Object} json JSON formatted data from scraping
 * @return {Object}      Array of rows to be looped for getAkkCheaoest function
 */
function prepareRows(json) {
	var _json = _.cloneDeep(json[0]);
	var rows = [];
	rows = rows.concat(_.values(_json.dep_table));
	if (!!_json.ret_table[0])
		rows = rows.concat({ RT:true }, _.values(_json.ret_table));
	return [rows];
}

function getCalendarPrice(json) {
	var _this = this;
	var format = ['DDMMM', 'DMMM'];
	var format2 = ['DDMMMHHmm', 'DMMMHHmm'];
	return new Promise(function(resolve, reject) {
		if (!json[0].dep_table || !json[0].dep_table[0])
			return resolve();
		var hiddens = json[0].dep_table[0].hidden.split('|');
		var date = moment(hiddens[3], format);
		var dayRangeForExpiredCheck = 2;
		var checkDate = moment()
			.add(dayRangeForExpiredCheck, 'day');
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		var cheapests = [];
		var realDst = _this._dt.dst;
		var rowIdx = 0;
		_.each(json[0].dep_table, function(flight, i) {
			var rute = flight.hidden.match(/[A-Z]{6}/)[0] || '';
			dst = rute.substr(3, 3).toLowerCase();
			if (dst === realDst.toLowerCase()) {
				hiddens = flight.hidden.split('|');
				var depart = moment(hiddens[3] + hiddens[8], format2);
				if (_this.isBookable(depart)){
					try{
						if (json[0].dep_cheapests[rowIdx].prices){
							cheapests.push(json[0].dep_cheapests[rowIdx]);
						}
					}catch(e){
						debug('getCalendarPrice',json[0].dep_cheapests[rowIdx]);
					}
					rowIdx++;
				}
			}
		});
		debug('before filter %d', rowIdx);
		debug('after filter %d', cheapests.length);
		if((_this._dt.rute.toLowerCase()=='rt' || _this.oriData && _this.oriData.rute=='rt')
			 && json[0].ret_table && json[0].ret_table[0]){
			var hiddens = json[0].ret_table[0].hidden.split('|');
			var date = moment(hiddens[3], format);
			var dayRangeForExpiredCheck = 2;
			var checkDate = moment()
				.add(dayRangeForExpiredCheck, 'day');
			_this.isSameDay = false;
			if (date.isBefore(checkDate, 'day'))
				_this.isSameDay = true;
			var retCheapests = [];
			var rowIdx = 0;
			_.each(json[0].ret_table, function(flight, i) {
				hiddens = flight.hidden.split('|');
				var depart = moment(hiddens[3] + hiddens[8], format2);
				if (_this.isBookable(depart)){
					try{
						if (json[0].ret_cheapests[rowIdx].prices){
							retCheapests.push(json[0].ret_cheapests[rowIdx]);
						}
					}catch(e){
						debug('getCalendarPrice',json[0].ret_cheapests[rowIdx]);
					}
					rowIdx++;
				}
			});
			debug('return before filter %d', _.size(json[0].ret_table));
			debug('return after filter %d', retCheapests.length);
		}
		var cheapestFlight = _.min(cheapests, function(cheapest, i) {
			debug('cheapests: %j', cheapest.prices.adult);
			return cheapest.prices.adult;
		});
		return resolve(cheapestFlight.prices);
	});
}

var LionPrototype = {
	init: init,
	getAllRoutes: getAllRoutes,
	mergeCache: mergeCache,
	getCheapestInRow: getCheapestInRow,
	generateData: generateData,
	scrapeLostData: scrapeLostData,
	mergeCachePrices: mergeCachePrices,
	prepareRows: prepareRows,
	getCalendarPrice: getCalendarPrice,
	getCache: getCache,
	getPrice: getPrice,
	calculateAdult: calculateAdult,
	calculateChild: calculateChild,
	calculateInfant: calculateInfant,
	calculateBasic: calculateBasic,
};
var Lion = Base.extend(LionPrototype);
module.exports = Lion;
