var Base = require('../Base');
var moment = require('moment');
var Promise = require('promise');
var debug = require('debug')('raabbajam:priceCacheCalendar:airasia');
var _ = require('lodash');
var cheerio = require('cheerio');
var priceScrapers = require('priceScraper');
var AirasiaPriceScrapers = priceScrapers.airasia;
var cheerio = require('cheerio');

function init(dt, scrape, args) {
	this._super('airasia', dt, scrape, args);
	this.parallel = false;
	this.expired = 12;
	this._this = args._this;
	this.addons = ['calculateBaggage'];
}

function getAllRoutes() {
	var _this = this;
	var routes = [];
	var json = _this._scrape[0];
	var rows = [].concat(_.values(json.dep_table), _.values(json.ret_table));
	rows.forEach(function(row) {
		// debug('row', row);
		var departCity = (row.dateDepart.match(/\(([A-Z]{3})\)/) || [])[1];
		var arriveCity = (row.dateArrive.match(/\(([A-Z]{3})\)/) || [])[1];
		if (!departCity && !arriveCity)
			return true;
		var currentRoute = departCity + arriveCity;
		currentRoute = currentRoute.toLowerCase();
		if (routes.indexOf(currentRoute) === -1) {
			routes.push(currentRoute);
		}
	});
	debug('routes', routes);
	return routes;
}

function mergeCache() {
	var _this = this;
	var _cache = _this.cache;
	var _class = 'lo';
	var json = _this._scrape[0];
	var lowestPrices = {};
	var realRoute = _this._dt.ori.toLowerCase() + _this._dt.dst.toLowerCase();
	var rows = [].concat(_.values(json.dep_table), _.values(json.ret_table));

	function looper(dir) {
		var rows = _.values(json[dir + '_table']);
		rows.forEach(function(row) {
			var lowestPriceRows = [];
			var departCity = (row.dateDepart.match(/\(([A-Z]{3})\)/) || [])[1];
			var arriveCity = (row.dateArrive.match(/\(([A-Z]{3})\)/) || [])[1];
			if (!departCity && !arriveCity)
				return true;
			var currentRoute = departCity + arriveCity;
			currentRoute = currentRoute.toLowerCase();
			if (!_this.cache[currentRoute])
				return true;
			var currentCache = _this.cache[currentRoute];
			if(row.lowFare.trim()!='-'){
				var harga = 'lowFare';
			}else if(row.hiFlyer.trim()!='-'){
				var harga = 'hiFlyer';
			}else if(row.hi2Flyer.trim()!='-'){
				var harga = 'hi2Flyer';
			}else{
				return true;
			}
			var matchNominal = row[harga].match(/price"><span>([\s\S]+?)IDR/);
			// debug('matchNominal',matchNominal)
			var nominal = (matchNominal || [])[1];
			if(!nominal){
				debug("mergeCache row.lowFare & row.hiFlyer kosong");
				return true;
			}
			nominal = Math.round(+nominal.replace(/\D/g, '') / 1000);
			lowestPrices[currentRoute] = nominal * 1000;
			/*var flightCode = (row.lowFare.match(/\|([A-Z]{2})/) || [])[1];
			var classCode = _class.toLowerCase() + nominal;
			var cachePrice = (currentCache[flightCode] && currentCache[flightCode][classCache]) || 0;
			if(!lowestPrices[currentRoute] || (!!cachePrice && cachePrice < lowestPrices[currentRoute]))
			lowestPrices[currentRoute] = cachePrice;
			row.lowFare = row.lowFare.replace(/price"><span>([\s\S]+)IDR/, 'price"><span>' + 100000 + ' IDR');
			lowestPriceRows.push(lowestPrices[currentRoute]);*/
		});
		return rows;
	}
	json.dep_table = looper('dep');
	if (!!json.ret_table)
		json.ret_table = looper('ret');
	// _this._scrape[0] = json;
	debug('merge cache lowestPrices', lowestPrices);
	return lowestPrices;
}

/**
 * return an array of object with ori, dst, class and flight property
 * @param  {Object} row Row object
 * @return {Array}     An array of object with ori, dst, class and flight property
 */
function getCheapestInRow(row) {
	// debug('rowAll',row );
	var outs = [];
	var seatRequest = this.paxNum || 1;
	if (!row.lowFare)
		return outs;
	var departCity = (row.dateDepart.match(/\(([A-Z]{3})\)/) || [])[1];
	var arriveCity = (row.dateArrive.match(/\(([A-Z]{3})\)/) || [])[1];
	if (!departCity && !arriveCity)
		return outs;
	var currentRoute = departCity + arriveCity;
	if(row.lowFare.trim()!='-'){
		var _class = 'lo';
		var harga = 'lowFare';
	}else if(row.hiFlyer.trim()!='-'){
		var _class = 'hi';
		var harga = 'hiFlyer';
	}else if(row.hi2Flyer.trim()!='-'){
		var _class = 'pr';
		var harga = 'hi2Flyer';
	}else{
		return outs;
	}
	var matchNominal = row[harga].match(/price"><span>([\s\S]+?)IDR/);
	var flightCode = row[harga].match(/[A-Z]{2}\~\ ?[0-9]{3,4}/g)
		.join('|')
		.replace(/\~/g, '-')
		.replace(/\ /g, '');
	// debug('matchNominal',matchNominal)
	var nominal = (matchNominal || [])[1];
	if(!nominal){
		debug("mergeCache row.lowFare & row.hiFlyer kosong");
		return outs;
	}
	nominal = Math.round(+nominal.replace(/\D/g, '') / 1000);
	var classCode = _class.toLowerCase() + nominal;
	var out = {
		ori: departCity,
		dst: arriveCity,
		flight: flightCode,
		class: classCode
	};
	if (!!out.class)
		outs.push(out);
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
		dataAll[id] = data;
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
    _this._this.data.query.rute = 'ow';
	_this.data = [];
	_this.data.query = this._dt;
	_this.allModes = [];
	_this.cekAllIds = [];
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
    	if(id.ori==_this.oriData.ori){
    		_this.idsDep.push(id);
    	}else{
    		_this.idsRet.push(id);
    	}
    }
    var that = _this._this;
    _this.relogModesId = false;
    for(var i in _this[note]){
    	if(!_this.cekAllIds[i]){
    		_this.cekAllIds[i] = _this[note][i];
    		_this.relogModesId = _this[note][i];
    		break;
    	}
    }
    if(!_this.relogModesId){
	    _this.allModes.push(options.mode);
	    _this.relogModes = false;
	    for(var i in _this.modes){
	        if(!_this.allModes[i]){
	            _this.relogModes = _this.modes[i];
	            break;
	        }
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
    that.step1()
    .then(function(res){
    	that.resFlight = res;
        return _this.getPrice(_this.relogModesId, that);
    })
    .then(function(res){
        that.resFlight = false;
        if(_this.relogModesId){
        	return _this.getCache(options, note, resolve); 
        }else if(_this.relogModes){
        	_this.cekAllIds = [];
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
        		return resolve();
        	}
        }
    })
    .catch(function(err){
        debug(err.stack);
        return resolve();
    })
}

function getPrice(_dt, that){
    var _this = this;
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
                    _this.saveCache(_this.resultsPrice[_id], _data, function(err, res){
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
	var _100  = results[0][0];
	var basic = +_100.depart.fare.adults.replace(/\d+ x /, '');
	var taxes = _.values(_100.depart.taxesAndFees);
	var tax   = taxes.reduce(function(all, _tax) {
		return +_tax + all;
	}, 0);
	// return basic + (tax / this.dt.passengersNum);
	return +_100.totalIDR;
}
function calculateChild(results) {
	return this.calculateAdult(results);
}
function calculateInfant(results) {
	if (!!this.dt) {
		for(var i = 1; i <=3; i++){
			if(!this.dt['transit' + i])
				break;
		}
	}
	var trip = !!this.dt && this.dt.tripNum || i;
	return 150000 * trip;
}
function calculateBasic(results) {
	var _100 = results[0][0];
	return +_100.depart.fare.adults.replace(/\d+ x /, '');
}
function calculateBaggage(results) {
	var _100 = results[0][0];
	var baggages = _100.depart.addOns.baggage;
	var price = 0;
	try{
		price = baggages[0].availableSsrs[0].price;
	}catch(e){
		debug(e);
	}
	return price;
}

/**
 * Merge json data with cheapest data from db
 * @param  {Object} json JSON formatted of scraped data
 * @return {Object}      JSON formatted of scraped data already merged with cache data
 */
function mergeCachePrices(json) {
	var _json = _.cloneDeep(json);
	var _this = this;
	var seatRequest = this.paxNum || 1;
	// debug('_this.cachePrices',JSON.stringify(_this.cachePrices, null, 2));
	// debug('_json.dep_table',_json)
	
	var format = ['M/D/YYYY', 'YYYY/MM/DD'];
	var format2 = ['M/D/YYYY HHmm', 'YYYY/MM/DD HHmm'];
	var dayRangeForExpiredCheck = 2;
	var checkDate = moment().add(dayRangeForExpiredCheck, 'day');
	_json[0].dep_table = _.mapValues(_json[0].dep_table, function(row) {
		row.cheapest = {
			class: 'Full',
			available: 0
		};
		var departCity = (row.dateDepart.match(/\(([A-Z]{3})\)/) || [])[1];
		var arriveCity = (row.dateArrive.match(/\(([A-Z]{3})\)/) || [])[1];
		// debug('departCity', departCity, 'arriveCity', arriveCity );
		if (!departCity && !arriveCity)
			return row;
		var currentRoute = departCity + arriveCity;
		currentRoute = currentRoute.toLowerCase();
		// debug('_this.cachePrices[currentRoute]', _this.cachePrices[currentRoute])
		if (!_this.cachePrices[currentRoute])
			return row;
		if(row.lowFare.trim()!='-'){
			var _class = 'lo';
			var harga = 'lowFare';
		}else if(row.hiFlyer.trim()!='-'){
			var _class = 'hi';
			var harga = 'hiFlyer';
		}else if(row.hi2Flyer.trim()!='-'){
			var _class = 'pr';
			var harga = 'hi2Flyer';
		}else{
			return row;
		}
		var matchNominal = row[harga].match(/price"><span>([\s\S]+?)IDR/);
		var flightCode = row[harga].match(/[A-Z]{2}\~\ ?[0-9]{3,4}/g)
			.join('|')
			.replace(/\~/g, '-')
			.replace(/\ /g, '');
		// debug('matchNominal',matchNominal)
		var nominal = (matchNominal || [])[1];
		if(!nominal){
			debug("mergeCache row.lowFare & row.hiFlyer kosong");
			return outs;
		}
		nominal = Math.round(+nominal.replace(/\D/g, '') / 1000);
		flightCode = flightCode.toLowerCase();
		var classCode = _class.toLowerCase() + nominal;
		var $ = cheerio.load(row.dateDepart);
		var date = moment.utc($('#UTCDATE').text(), format);
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		var depart = moment.utc($('#UTCDATE').text() + ' ' + $('#UTCTIME').text(), format2).local();
			try {
				if (_this.isBookable(depart)){
					row.cheapest = _this.cachePrices[currentRoute][flightCode][classCode];
					row.cheapest.class = classCode;
					row.cheapest.available = 'N/A';
				}
			} catch (e) {
				debug(e.message, currentRoute, flightCode, classCode);
				_this.cachePrices[currentRoute] = _this.cachePrices[currentRoute] || {};
				_this.cachePrices[currentRoute][flightCode] = _this.cachePrices[currentRoute][flightCode] || {};
			}
		// debug('mergeCachePrices row', row)
		return row;
	});
	_json[0].ret_table = _.mapValues(_json[0].ret_table, function(row) {
		row.cheapest = {
			class: 'Full',
			available: 0
		};
		var departCity = (row.dateDepart.match(/\(([A-Z]{3})\)/) || [])[1];
		var arriveCity = (row.dateArrive.match(/\(([A-Z]{3})\)/) || [])[1];
		// debug('departCity', departCity, 'arriveCity', arriveCity );
		if (!departCity && !arriveCity)
			return row;
		var currentRoute = departCity + arriveCity;
		currentRoute = currentRoute.toLowerCase();
		// debug('_this.cachePrices[currentRoute]', _this.cachePrices[currentRoute])
		if (!_this.cachePrices[currentRoute])
			return row;
		if(row.lowFare.trim()!='-'){
			var _class = 'lo';
			var harga = 'lowFare';
		}else if(row.hiFlyer.trim()!='-'){
			var _class = 'hi';
			var harga = 'hiFlyer';
		}else if(row.hi2Flyer.trim()!='-'){
			var _class = 'pr';
			var harga = 'hi2Flyer';
		}else{
			return row;
		}
		var matchNominal = row[harga].match(/price"><span>([\s\S]+?)IDR/);
		var flightCode = row[harga].match(/[A-Z]{2}\~\ ?[0-9]{3,4}/g)
			.join('|')
			.replace(/\~/g, '-')
			.replace(/\ /g, '');
		// debug('matchNominal',matchNominal)
		var nominal = (matchNominal || [])[1];
		if(!nominal){
			debug("mergeCache row.lowFare & row.hiFlyer kosong");
			return outs;
		}
		nominal = Math.round(+nominal.replace(/\D/g, '') / 1000);
		flightCode = flightCode.toLowerCase();
		var classCode = _class.toLowerCase() + nominal;
		var $ = cheerio.load(row.dateDepart);
		var date = moment.utc($('#UTCDATE').text(), format);
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		var depart = moment.utc($('#UTCDATE').text() + ' ' + $('#UTCTIME').text(), format2).local();
			try {
				if (_this.isBookable(depart)){
					row.cheapest = _this.cachePrices[currentRoute][flightCode][classCode];
					row.cheapest.class = classCode;
					row.cheapest.available = 'N/A';
				}
			} catch (e) {
				debug(e.message, currentRoute, flightCode, classCode);
				_this.cachePrices[currentRoute] = _this.cachePrices[currentRoute] || {};
				_this.cachePrices[currentRoute][flightCode] = _this.cachePrices[currentRoute][flightCode] || {};
			}
		// debug('mergeCachePrices row', row)
		return row;
	});
	// debug(_json.dep_table);
	// var ret = _json.return;
	_json.cachePrices = _this.cachePrices;
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
	// debug('rows',_json.departure.flights);
	if (!!_json.ret_table && !!_json.ret_table[0])
		rows = rows.concat(_.values(_json.ret_table));
	return rows;
}

function calendarPrice(_class) {
	debug('_class.adult + _class.baggage = %d + %d = %d', _class.adult, _class.baggage, _class.adult + _class.baggage);
	return _class.adult + _class.baggage;
}

function getCalendarPrice(json) {
	var _this = this;
	var format = ['M/D/YYYY', 'YYYY/MM/DD'];
	var format2 = ['M/D/YYYY HHmm', 'YYYY/MM/DD HHmm'];
	return new Promise(function(resolve, reject) {
		if (!json[0].dep_table && !json[0].dep_table[0] && !json[0].dep_table[0].dateDepart)
			return resolve();
		var $ = cheerio.load(json[0].dep_table[0].dateDepart);
		var date = moment.utc($('#UTCDATE').text(), format);
		var dayRangeForExpiredCheck = 2;
		var checkDate = moment().add(dayRangeForExpiredCheck, 'day');
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		var flights = _.filter(json[0].dep_table, function (flight) {
			var $ = cheerio.load(flight.dateDepart);
			var hour = +$('#UTCTIME').text().substr(0, 2);
			var depart = moment.utc($('#UTCDATE').text() + ' ' + $('#UTCTIME').text(), format2).local();
			if (_this.isBookable(depart)){
				try{
					debug('flight.cheapest.adult OK', flight.cheapest.adult);
					return flight;
				}catch(e){
					debug('flight.cheapest', flight.cheapest);
				}
			}
		});
		debug('after filter %d', flights.length);
		var cheapestFlight = _.min(flights, function (flight) {
			return flight.cheapest.adult;
		});
		return resolve(cheapestFlight.cheapest);
	});
}

var AirasiaPrototype = {
	init: init,
	getAllRoutes: getAllRoutes,
	mergeCache: mergeCache,
	getCheapestInRow: getCheapestInRow,
	generateData: generateData,
	scrapeLostData: scrapeLostData,
	mergeCachePrices: mergeCachePrices,
	prepareRows: prepareRows,
	calendarPrice: calendarPrice,
	getCalendarPrice: getCalendarPrice,
	getCache: getCache,
	getPrice: getPrice,
	calculateAdult: calculateAdult,
	calculateChild: calculateChild,
	calculateInfant: calculateInfant,
	calculateBasic: calculateBasic,
	calculateBaggage: calculateBaggage,
};
var Airasia = Base.extend(AirasiaPrototype);
module.exports = Airasia;
