var Base = require('../Base');
// var db = require('../libs/db');
// promise bulam jelas diguakan apa engga
var Promise = require('bluebird');
// var cheerio = require('cheerio');
// var moment = require('moment');
var debug = require('debug')('raabbajam:priceCacheCalendar:gos');
var priceScrapers = require('priceScraper');
// var priceScrapers = require('../../pricescraper');
var GosPriceScrapers = priceScrapers.gos;

function init(dt, scrape, args) {
	this._super('gos', dt, scrape, args);
	this.parallel = true;
}

function getAllRoutes() {
	var routes = [];
	var departFlights = this._scrape.depart_flights;
	var returnFlights = this._scrape.return_flights;
	
	function looper(route) {
		for (var i in route) {
			var flights = route[i];
			for (var j in flights) {
				var getOri = flights[j].departure.code.toLowerCase();
				var getDst = flights[j].arrival.code.toLowerCase();
				
				var currentRoute = getOri + getDst;
							
				if (routes.indexOf(currentRoute) === -1)
					routes.push(currentRoute);
			}
		}
	}
	
	looper(departFlights);
	if (returnFlights && returnFlights.length > 0)
		looper(returnFlights);
	
	return routes;
}


function mergeCache() {
	var groupFlight = 'ga';
	var lowestPrices = {};

	function looper(nameTable) {	
		this._scrape[nameTable].forEach(function (flights, i) {
			for (var j in flights) {
				var flight = flights[j];
				var getOri = flight.departure.code.toLowerCase();
				var getDst = flight.arrival.code.toLowerCase();
				var currentRoute = getOri + getDst;
				var currentCache = this.cache[currentRoute];
				var seats = flight.seats;
				for (var k in seats) {
					var seat = seats[k];
					if (seat.available)
						this._scrape[nameTable][i][j]['seats'][k]['price'] = currentCache && currentCache[groupFlight] && currentCache[groupFlight][seat.class.toLowerCase()] || 0;
				}
			}
		}.bind(this));
	}
	
	looper.call(this, 'depart_flights');
	if (this._scrape.return_flights)
		looper.call(this, 'return_flights');
	
	return lowestPrices;
}

function getCheapestInRow(rowAll) {
	var out = {
		ori: rowAll[0].departure.code,
		dst: rowAll[rowAll.length - 1].arrival.code,
		flight: 'ga'
	};
	var classes = '';
	rowAll.forEach(function (row, index) {
		var seats = row.seats;
		for (var i in seats) {
			if (seats[i].available > 0) {
				classes += seats[i].class;
				break;
			}
		}
		if (index > 0)
			out['transit' + index] = row.departure.code;
	});
	if (rowAll.length !== classes.length)
		return [];
	out.class = classes;
	return [out];
}

/**
 * Generate data to scrape from id
 * @param  {String} id String id from database
 * @return {Object}    Object data for scrape
 */
function generateData(id) {
	var _id = id.split('_');

	var allFlights = prepareRows(this._scrape);	
	var ori = _id[0];
	var dst = _id[1];
	var classArr = _id[4].split('');
	
	var data = {
		ori: ori,
		dst: dst,
		airline: _id[2],
		flightCode: _id[3],
		classCode: _id[4],
		dep_date: this._dt.dep_date.replace(/\s/g, '+'),
		rute: 'ow',
		action: 'price',
		// priceScraper: false,
		xToken: this._dt.xToken
	};
	for (var i = 5, j = 1, ln = _id.length; i < ln; i++, j++) {
		data['transit' + j] = _id[i];
	}
	
	loopClass:
	for (var i in classArr) {
		var checkClass = classArr[i];
		loopAllFlights:
		for (var j in allFlights) {
			var flights = allFlights[j];
			var checkOri = flights[0].departure.code.toLowerCase();
			var checkDst = flights[flights.length - 1].arrival.code.toLowerCase();
			if (ori === checkOri && dst === checkDst && flights.length === classArr.length) {
				loopFlights:
				for (var k in flights) {
					if (i === k) {			
						var seats = flights[k].seats;
						loopSeats:
						for (var l in seats) {
							if (checkClass === seats[l].class.toLowerCase() && seats[l].available > 0) {
								data['depOpt_' + i] = seats[l].identity.value;
								break loopAllFlights;
							}
						}
						
					}
				}
			}
		}
	}
	
	if (this._dt.rute === 'rt')
		data.dep_date = this._dt.ret_date.replace(/\s/g, '+');
	
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
	var urlLocal = 'http://localhost:3000/0/price/gos';
	var options = {
		scrape: this.scrape || urlLocal,
		dt: dt,
		airline: 'gos'
	};
	var gosPriceScrapers = new GosPriceScrapers(options);
	return gosPriceScrapers.run()
		.catch(function(err) {
			debug('gosPriceScrapers', err);
		});
}

/**
 * Merge json data with cheapest data from db
 * @param  {Object} json JSON formatted of scraped data
 * @return {Object}      JSON formatted of scraped data already merged with cache data
 */
function mergeCachePrices(json) {
	
	var out = json;
	
	function looper(tabel) {
		var nameCheapest = tabel + '_cheapests';
		var nameTable = tabel + '_flights';
		var groupFlight = 'ga';
		out[nameCheapest]= [];
		
		for (var i in json[nameTable]) {
			var flights = json[nameTable][i];
			var checkOri = flights[0].departure.code.toLowerCase();
			var checkDst = flights[flights.length - 1].arrival.code.toLowerCase();
			var transit = '';
			var classes = '';
			var forCheapest = {
				prices: {
					adult: 0,
					child: 0,
					infant: 0,
					basic: 0
				}
			};
			
			for (var j in flights) {
				if (j > 0)
					transit += flights[j].departure.code.toLowerCase();
					
				var seats = flights[j].seats;
				for (var i in seats) {
					if (seats[i].available > 0) {
						classes += seats[i].class.toLowerCase();
						break;
					}
				}
				
			}
			
			var rute = checkOri + transit + checkDst;
			forCheapest.classes = classes;
			
			if (this.cachePrices[rute] && this.cachePrices[rute][groupFlight][classes])
				forCheapest.prices = this.cachePrices[rute][groupFlight][classes];
			
			out[nameCheapest].push(forCheapest);
		}
	}
	
	looper.call(this, 'depart');
	if (this._dt.rute === 'rt')
		looper.call(this, 'return');
	
	return out;
}

/**
 * Preparing rows to be looped on process
 * @param  {Object} json JSON formatted data from scraping
 * @return {Object}      Array of rows to be looped for getAkkCheaoest function
 */
function prepareRows(json) {
	if (json.return_flights)
		return json.depart_flights.concat(json.return_flights);
	return json.depart_flights;
}

function getCalendarPrice(json) {
	// var _this = this;
	// var format = ['DD MM YYYY', 'DD+MM+YYYY'];
	// var format2 = ['DD MM YYYY HH:mm', 'DD+MM+YYYY HH:mm'];
	// return new Promise(function(resolve, reject) {
	// 	if (!json[0].dep_table && !json[0].dep_table[0] && !json[0].dep_table[0].dateDepart)
	// 		return resolve();
	// 	var dep_date = _this._dt.dep_date;
	// 	var date = moment(dep_date, format);
	// 	var dayRangeForExpiredCheck = 2;
	// 	var checkDate = moment()
	// 		.add(dayRangeForExpiredCheck, 'day');
	// 	_this.isSameDay = false;
	// 	if (date.isBefore(checkDate, 'day'))
	// 		_this.isSameDay = true;
	// 	var cheapests = [];
	// 	_.each(json[0].dep_table, function(flight) {
	// 		// debug('depart %s', dep_date + ' ' + flight.times);
	// 		var depart = moment(dep_date + ' ' + flight.times, format2);
	// 		if (_this.isBookable(depart)){
	// 			try{
	// 				if (flight.cheapest){
	// 					cheapests.push(flight.cheapest);
	// 				}
	// 			}catch(e){
	// 				debug('flight.cheapest',flight.cheapest);
	// 			}
	// 		}
	// 	});
	// 	debug('before filter %d', _.size(json[0].dep_table));
	// 	debug('after filter %d', cheapests.length);
	// 	var cheapestFlight = _.min(cheapests, function(cheapest, i) {
	// 		debug('cheapests: %j', cheapest.adult);
	// 		return cheapest.adult;
	// 	});
	// 	return resolve(cheapestFlight);
	// });
}

var GosPrototype = {
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
var Gos = Base.extend(GosPrototype);
module.exports = Gos;
