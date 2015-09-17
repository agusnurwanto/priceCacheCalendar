var Base = require('../Base');
var db = require('../libs/db');
var Promise = require('bluebird');
var cheerio = require('cheerio');
var moment = require('moment');
var debug = require('debug')('raabbajam:priceCacheCalendar:gos');
var _ = require('lodash');
var priceScrapers = require('priceScraper');
// var priceScrapers = require('../../pricescraper');
var GosPriceScrapers = priceScrapers.gos;

// console.log(priceScrapers);

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
						this._scrape[nameTable][i][j]['seats'][k]['price'] = currentCache && currentCache[groupFlight] && currentCache[groupFlight][k] || 0;
				}
			}
		}.bind(this));
	}
	
	looper.call(this, 'depart_flights');
	if (this._scrape.return_flights && this._scrape.return_flights.length > 0)
		looper.call(this, 'return_flights');
	
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
	var seatRequest = 1; //this.paxNum || 1;
	if (!row.normal_fare)
		return outs;
	var rutes = _.map(_.uniq(row.normal_fare.match(/~([A-Z]){3}~/g)), function(rute) {
		return rute.replace(/\W/g, '');
	});
	// debug('rutes',rutes);
	var flight = row.flight.substr(0, 2) || '';
	var out = {
		ori: rutes.shift(),
		dst: rutes.pop(),
		// flight: row.flightCode
		flight: flight,
	};
	rutes.forEach(function(rute, i) {
			out['transit' + (i + 1)] = rute;
		});
		// var aClass = ['Q', 'P', 'O', 'N', 'M', 'L', 'K', 'H', 'G', 'F', 'E', 'D', 'B', 'A'];
	var aClass = row.normal_fare.match(new RegExp('\\( ([A-Za-z]+)/Cls;\r\n([\\s\\S]+?)\\)\r\n\\s+</p><script>(\\d+)', 'g'));
		// debug(aClass)
	_.forEach(aClass, function(sClass) {
			var matches = sClass.match(new RegExp('\\( ([A-Za-z]+)/Cls;\r\n([\\s\\S]+?)\\)\r\n\\s+</p><script>(\\d+)'));
				// debug(matches);
			if (!matches)
				return true;
			// debug(matches[1], matches[2]);
			var matchAvailable = +(matches[2] || '0')
				.trim();
			if (matchAvailable >= seatRequest) {
				var _class = (matches[1] || 'N/A')
					.trim();
				var nominal = +matches[3] / 1000;
				// debug('matchAvailable', matchAvailable, '_class', _class, 'nominal', nominal)
				out.class = _class + nominal;
				return false;
			}
		});
		// debug(out);
	if (!!out.class)
		outs.push(out);
	return outs;
}

/**
 * Generate data to scrape from id
 * @param  {String} id String id from database
 * @return {Object}    Object data for scrape
 */
function generateData(id) {
	var _id = id.split('_');
	var cek_instant_id = _id[3] + '_' + _id[4];
	cek_instant_id = cek_instant_id.toUpperCase();
	var passengersNum = (+this._dt.adult) + (+this._dt.child);
	debug('passengersNum', passengersNum);
	var data = {
		ori: _id[0],
		dst: _id[1],
		airline: _id[2],
		flightCode: _id[3],
		classCode: _id[4],
		passengersNum: passengersNum,
		cek_instant: 1,
		cek_instant_id: cek_instant_id,
		dep_date: this._dt.dep_date.replace(/\s/g, '+'),
		// dep_date      : moment().add(1, 'M').format('DD+MMM+YYYY'),
		rute: 'OW',
		dep_radio: '1Fare6',
		action: 'price',
		user: 'mitrabook',
		priceScraper: false,
		xToken: this._dt.xToken,
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
	// var urlAirbinder = 'http://pluto.live:4000/0/price/citilink';
	var urlAirbinder = 'http://localhost:3000/0/price/citilink';
	// debug('dt',dt)
	var options = {
		scrape: this.scrape || urlAirbinder,
		dt: dt,
		airline: 'citilink'
	};
	var citilinkPriceScrapers = new CitilinkPriceScrapers(options);
	return citilinkPriceScrapers.run()
		.catch(function(err) {
			debug('citilinkPriceScrapers', err);
		});
}

/**
 * Merge json data with cheapest data from db
 * @param  {Object} json JSON formatted of scraped data
 * @return {Object}      JSON formatted of scraped data already merged with cache data
 */
function mergeCachePrices(json) {
	
}

/**
 * Preparing rows to be looped on process
 * @param  {Object} json JSON formatted data from scraping
 * @return {Object}      Array of rows to be looped for getAkkCheaoest function
 */
function prepareRows(json) {
	var rows  = [];
	
	json.depart_flights.forEach(function (flights, index) {
		flights.forEach(function (flight, i) {
			rows.push(flight);
		});
	});
	
	if (json.return_flights) {
		json.depart_flights.forEach(function (flights, index) {
			flights.forEach(function (flight, i) {
				rows.push(flight);
			});
		});
	}
	
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
			// debug('depart %s', dep_date + ' ' + flight.times);
			var depart = moment(dep_date + ' ' + flight.times, format2);
			if (_this.isBookable(depart)){
				try{
					if (flight.cheapest){
						cheapests.push(flight.cheapest);
					}
				}catch(e){
					debug('flight.cheapest',flight.cheapest);
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
