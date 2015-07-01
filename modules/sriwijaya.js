var Base = require('../Base');
var moment = require('moment');
var debug = require('debug')('raabbajam:priceCacheCalendar:sriwijaya');
var _ = require('lodash');
var db = require('../libs/db');
var priceScrapers = require('priceScraper');
var SriwijayaPriceScrapers = priceScrapers.sriwijaya;
var cheerio = require('cheerio');
var Promise = require('promise');

function init(dt, scrape, args) {
	this._super('sriwijaya', dt, scrape, args);
	this.parallel = false;
}

function getAllRoutes() {
	var _this = this;
	var routes = [];
	var $ = cheerio.load(_this._scrape);
	var trs = $('#table_go > tr, #table_back > tr');
	if (!trs)
		return false;

	function looper(dir) {
		$('#table_' + dir + ' > tr')
			.each(function(idx, tr) {
				var cities = $('.leftTD', tr)
					.text()
					.match(/\s[A-Z]{3}\s/g);
				if (!cities)
					return true;
				var currentRoute = _.uniq(cities.map(function(city) {
						return city.trim();
					}))
					.join('');
				// debug('currentRoute',currentRoute)
				if (routes.indexOf(currentRoute) === -1) {
					routes.push(currentRoute);
				}
			});
	}
	looper('go');
	looper('back');
	return routes;
}

function mergeCache() {
	var _this = this;
	var _cache = _this.cache;
	var lowestPrices = {};
	var $ = cheerio.load(_this._scrape);
	var trs = $('#table_go > tr, #table_back > tr');
	if (!trs)
		return false;
	// debug('_this.cache',_this.cache)
	function looper(dir) {
		var realRoute = _this._dt.ori.toLowerCase() + _this._dt.dst.toLowerCase();
		var lowestPriceRows = [];
		$('#table_' + dir + ' > tr')
			.each(function(idx, tr) {
				var tdText = $('.leftTD, .leftTD_even', tr)
					.text();
				var cities = tdText.match(/\s[A-Z]{3}\s/g);
				var fCodes = tdText.match(/SJ\d+/g);
				// debug('cities', cities);
				if (!cities)
					return true;
				var currentRoute = _.uniq(cities.map(function(city) {
					return city.trim()
						.toLowerCase();
				}));
				currentRoute = [currentRoute.shift(), currentRoute.pop(), currentRoute.join('')].join('')
					.toLowerCase();
				var currentFCode = fCodes.map(function(code) {
						return code.length - 'SJ'.length;
					})
					.join('');
				// debug('currentRoute', currentRoute, 'currentFCode', currentFCode);
				// if (!_this.cache[currentRoute] || !_this.cache[currentRoute][currentFCode])
				// 	return true;
				// get all radio
				// debug('_cache[currentRoute][currentFCode]', _cache[currentRoute][currentFCode])
				$('.avcellTd, .avcellTd_even, .avcellTd_disable', tr)
					.each(function(i, td) {
						// debug(idx + ':' + i)
						var classCode = ($('.classLetterCode', td)
								.text() || '')
							.toLowerCase();
						var available = +(($('.availNumCode', td)
								.text() || '')
							.replace(/\D/g, ''));
						var cachePrice = (_cache[currentRoute] &&
							_cache[currentRoute][currentFCode] &&
							_cache[currentRoute][currentFCode][classCode]) || 0;
						cachePrice = Math.round(cachePrice / 10) * 10;
						// debug(currentRoute + ':' + currentFCode + ':' + classCode + ' = ' + available + '. cachePrice: ' + cachePrice)
						// debug('cachePrice',cachePrice)
						// $('.avcellFare', td).text('' + cachePrice);
						if (!!available && (!lowestPrices[currentRoute] || (lowestPrices[currentRoute] > cachePrice && !!cachePrice)))
							lowestPrices[currentRoute] = cachePrice;
					});
				lowestPriceRows.push(lowestPrices[currentRoute]);
			});
		// if there is more than one flight in on one row
		/*if (row.length > 1 && lowestPriceRows.length > 1) {
			var lowestPriceRow = lowestPriceRows.reduce(function(price, num){return num + price}, 0)
			if (!lowestPrices[realRoute] || lowestPriceRow < lowestPrices[realRoute]) {
				lowestPrices[realRoute] = lowestPriceRow;
				// debug(lowestPrices[realRoute], lowestPriceRow);
			}
		}*/
	}
	looper('go');
	looper('back');
	this._scrape = '<body>' + $('body')
		.html() + '</body>';
	return lowestPrices;
}

/**
 * return an array of object with ori, dst, class and flight property
 * @param  {Object} row Row object
 * @return {Array}     An array of object with ori, dst, class and flight property
 */
function getCheapestInRow(row) {
	// debug('rowAll',row );
	var seatRequest = this.paxNum || 1;
	var outs = [];
	var rutes = _.values(row.depart);
	rutes.push(_.values(row.arrive)
		.pop());
	rutes = rutes.map(function(rute) {
		return rute.substr(0, 3);
	});
	var c_flight = [];
	for(var j in row.code_flight){
		c_flight.push(row.code_flight[j].replace(/ /g, ''));
	}
	var flight = c_flight.join('|');
	var out = {
		ori: rutes.shift(),
		dst: rutes.pop(),
		flight: flight,
	};
	var radio = '';
	_.forEach(row, function(idx,_class) {
		if(_class && _class.length == 1){
			radio = _class;
			return false;
		}
	})
	var numTrips = row[radio].length;
	rutes.forEach(function(rute, i) {
		out['transit' + (i + 1)] = rute;
	});
	var _classes = '';

	for (var i = 0; i < numTrips; i++) {
		_.forEach(row, function(idx,_class) {
			if(_class && _class.length == 1){
				var matchAvailable;
				if (row[_class][i] && row[_class][i].indexOf('disabled') === -1 && (matchAvailable = +row[_class][i].match(/>\((\d)\)</)[1]) > 0) {
					if (+matchAvailable >= seatRequest) {
						_classes += _class;
						out.class = _classes;
						return false;
					}
				}
			}
		});
		// debug('out.class', out.class, numTrips);
		if (!!out.class && out.class.length === numTrips){
			outs.push(out);
		}
	}
	return outs;
}

/**
 * Generate data to scrape from id
 * @param  {String} id String id from database
 * @return {Object}    Object data for scrape
 */
function generateData(id) {
	var _id = id.split('_');
	// var rutes = _id[3];
	var cek_instant_id = _id[3] + '_' + _id[4];
	cek_instant_id = cek_instant_id.toUpperCase();
	var data = {
		ori: _id[0].toUpperCase(),
		dst: _id[1].toUpperCase(),
		airline: _id[2],
		flightCode: _id[3],
		classCode: _id[4],
		cek_instant: 1,
		cek_instant_id: cek_instant_id,
		dep_radio: cek_instant_id,
		dep_date: this._dt.dep_date,
		rute: 'OW',
		action: 'price',
		user: 'DEPAG0101',
		priceScraper: false
	};
	for (var i = 5, j = 1, ln = _id.length; i < ln; i++, j++) {
		data['transit' + j] = _id[i];
	}
	return data;
}

/**
 * Scrape lost data
 * @param  {String} id Data generated id to scrape
 * @return {Object}    Return cache data after scrape it
 */
function scrapeLostData(id) {
	debug('scrapeLostData', id);
	var dt = this.generateData(id);
	var urlAirbinder = 'http://128.199.251.75:9019/price';
	var urlPluto = 'http://folbek.me:3000/0/price/sriwijaya';
	var options = {
		scrape: this.scrape || urlAirbinder,
		dt: dt,
		airline: 'sriwijaya'
	};
	var sriwijayaPriceScrapers = new SriwijayaPriceScrapers(options);
	return sriwijayaPriceScrapers.run()
		.catch(function(err) {
			debug('sriwijayaPriceScrapers', err);
		});
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
	var format = ['DD MM YYYY', 'DD+MM+YYYY'];
	var format2 = ['DD MM YYYY HH:mm', 'DD+MM+YYYY HH:mm'];
	debug('_this.cachePrices', JSON.stringify(_this.cachePrices, null, 2));
	// debug('_json.dep_table',_json)
	var dep_date = _this._dt.dep_date;
	var date = moment(dep_date, format);
	var dayRangeForExpiredCheck = 2;
	var checkDate = moment()
		.add(dayRangeForExpiredCheck, 'day');
	_this.isSameDay = false;
	if (date.isBefore(checkDate, 'day'))
		_this.isSameDay = true;
	_json[0].dep_table = _.mapValues(_json[0].dep_table, function(row) {
		row.cheapest = {
			class: 'Full',
			available: 0
		};
		if (!row || !row.depart || !row.arrive)
			return row;
		// debug('row',row)
		var rutes = _.values(row.depart);
		rutes.push(_.values(row.arrive)
			.pop());
		rutes = rutes.map(function(rute) {
			return rute.substr(0, 3);
		});
		var rute = rutes.join('')
			.toLowerCase();
		debug('rute', rute);

		var c_flight = [];
		for(var j in row.code_flight){
			c_flight.push(row.code_flight[j].replace(/ /g, ''));
		}
		var flight = c_flight.join('|').toLowerCase();
		
		var radio = '';
		_.forEach(row, function(idx,_class) {
			if(_class && _class.length == 1){
				radio = _class;
				return false;
			}
		})
		var numTrips = row[radio].length;

		var __class = '';
		var available = [];
		for (var i = 0; i < numTrips; i++) {
			_.forEach(row, function(idx,_class) {
				if(_class && _class.length == 1){
					var matchAvailable;
					if (row[_class][i] && row[_class][i].indexOf('disabled') === -1 && (matchAvailable = +row[_class][i].match(/>\((\d)\)</)[1]) > 0) {
						if (+matchAvailable >= seatRequest) {
							var times = row.depart[1].substr(-5);
							debug('depart %s', dep_date + ' ' + times);
							var depart = moment(dep_date + ' ' + times, format2);
							if (_this.isBookable(depart)){
								__class += _class;
								available.push(matchAvailable);
							}
							return false;
						}
					}
				}
			});
		}
		try {
			row.cheapest = _this.cachePrices[rute][flight][__class.toLowerCase()];
			row.cheapest.class = __class.toLowerCase();
			row.cheapest.available = available.join('_');
		} catch (e) {
			debug('rute, flight, __class, e.stack', rute, flight, __class, e.stack);
		}
		debug('row.cheapest', row.cheapest, rute, flight, __class, numTrips);
		return row;
	});
	_json[0].ret_table = _.mapValues(_json[0].ret_table, function(row) {
		row.cheapest = {
			class: 'Full',
			available: 0
		};
		if (!row || !row.depart || !row.arrive)
			return row;
		// debug('row',row)
		var rutes = _.values(row.depart);
		rutes.push(_.values(row.arrive)
			.pop());
		rutes = rutes.map(function(rute) {
			return rute.substr(0, 3);
		});
		var rute = rutes.join('')
			.toLowerCase();
		debug('rute', rute);

		var c_flight = [];
		for(var j in row.code_flight){
			c_flight.push(row.code_flight[j].replace(/ /g, ''));
		}
		var flight = c_flight.join('|').toLowerCase();
		
		var radio = '';
		_.forEach(row, function(idx,_class) {
			if(_class && _class.length == 1){
				radio = _class;
				return false;
			}
		})
		var numTrips = row[radio].length;

		var __class = '';
		var available = [];
		for (var i = 0; i < numTrips; i++) {
			_.forEach(row, function(idx,_class) {
				if(_class && _class.length == 1){
					var matchAvailable;
					if (row[_class][i] && row[_class][i].indexOf('disabled') === -1 && (matchAvailable = +row[_class][i].match(/>\((\d)\)</)[1]) > 0) {
						if (+matchAvailable >= seatRequest) {
							var times = row.depart[1].substr(-5);
							debug('depart %s', dep_date + ' ' + times);
							var depart = moment(dep_date + ' ' + times, format2);
							if (_this.isBookable(depart)){
								__class += _class;
								available.push(matchAvailable);
							}
							return false;
						}
					}
				}
			});
		}
		try {
			row.cheapest = _this.cachePrices[rute][flight][__class.toLowerCase()];
			row.cheapest.class = __class.toLowerCase();
			row.cheapest.available = available.join('_');
		} catch (e) {
			debug('rute, flight, __class, e.stack', rute, flight, __class, e.stack);
		}
		debug('row.cheapest', row.cheapest, rute, flight, __class, numTrips);
		return row;
	});
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
	debug('prepareRows', rows.length);
	return rows;
}

function getCalendarPrice(json) {
	var _this = this;
	var format = ['DD MM YYYY', 'DD+MM+YYYY'];
	var format2 = ['DD MM YYYY HH:mm', 'DD+MM+YYYY HH:mm'];
	return new Promise(function(resolve, reject) {
		if (!json[0].dep_table && !json[0].dep_table[0] && !json[0].dep_table[0].dateDepart)
			return resolve();
		var dep_date = _this._dt.dep_date;
		var date = moment(dep_date, format);
		var dayRangeForExpiredCheck = 2;
		var checkDate = moment()
			.add(dayRangeForExpiredCheck, 'day');
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		var cheapests = [];
		_.each(json[0].dep_table, function(flight) {
			var times = flight.depart[1].substr(-5);
			debug('depart %s', dep_date + ' ' + times);
			var depart = moment(dep_date + ' ' + times, format2);
			if (_this.isBookable(depart)){
				try{
					if (flight.cheapest.adult)
						cheapests.push(flight.cheapest);
				}catch(e){
					debug('getCalendarPrice',flight.cheapest);
				}
				
			}
		});
		debug('before filter %d', _.size(json[0].dep_table));
		debug('after filter %d', cheapests.length);
		var cheapestFlight = _.min(cheapests, function(cheapest, i) {
			debug('cheapests: %j', cheapest.adult);
			return cheapest.adult;
		});
		return resolve(cheapestFlight);
	});
}

var SriwijayaPrototype = {
	init: init,
	getAllRoutes: getAllRoutes,
	mergeCache: mergeCache,
	getCheapestInRow: getCheapestInRow,
	generateData: generateData,
	scrapeLostData: scrapeLostData,
	mergeCachePrices: mergeCachePrices,
	prepareRows: prepareRows,
	getCalendarPrice: getCalendarPrice,
};
var Sriwijaya = Base.extend(SriwijayaPrototype);
module.exports = Sriwijaya;
