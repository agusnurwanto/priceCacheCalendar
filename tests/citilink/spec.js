var expect = require('chai').expect;
var fs = require('fs');
var path = require('path');
var Citilink = require('../../index')('citilink');
var jsonFile = path.resolve(__dirname, 'sub-pdg-rt.json');
var resultFile = path.resolve(__dirname, 'result.json');

var mockBody = {dep_date: "06+09+2015", ret_date: "12+09+2015", ori: 'sub', dst: 'pdg'};
var mockDataCitilink = fs.readFileSync(jsonFile, 'utf8');

var debug       = require('debug')('raabbajam:priceCacheCalendar:test:citilink:spec');
describe.skip('Price Generator for Citilink', function () {
	this.timeout(20000);
	it('should extend base', function (next) {
		var citilink = new Citilink(mockBody, mockDataCitilink);
		expect(citilink.name).to.equal('citilink');
		next();
	});
	it('should return cache', function (next) {
		var citilink = new Citilink(mockBody, mockDataCitilink);
		citilink.getCache()
			.then(function () {
				expect(citilink.cache[mockBody.ori.toLowerCase()+mockBody.dst.toLowerCase()]).to.exist;
				// debug(citilink.cache);
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
	it('should loop get all routes', function (next) {
		var citilink = new Citilink(mockBody, mockDataCitilink);
		var routes = citilink.getAllRoutes();
		debug('routes',routes);
		expect(routes.length).gt(0);
		next();
	});
	it('should get all routes cache', function (next) {
		var citilink = new Citilink(mockBody, mockDataCitilink);
		var routes = citilink.getAllRoutes();
		citilink.getAllCaches(routes)
			.then(function () {
				debug('citilink.cache',citilink.cache);
				expect(citilink.cache).not.eq({});
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
	it('should merge all cache', function (next) {
		var citilink = new Citilink(mockBody, mockDataCitilink);
		var routes = citilink.getAllRoutes();
		citilink.getAllCaches(routes)
			.then(citilink.mergeCache.bind(citilink))
			.then(function (res) {
				// debug(JSON.stringify(citilink._scrape, null, 2));
				debug('lowestPrices', JSON.stringify(res, null, 2));
				debug(citilink.cache);
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
	it('should compare with db and insert to db if cheaper, for all lowest price', function (next) {
		var citilink = new Citilink(mockBody, mockDataCitilink);
		var routes = citilink.getAllRoutes();
		citilink.getAllCaches(routes)
			.then(citilink.mergeCache.bind(citilink))
			.then(citilink.insertAllLowest.bind(citilink))
			.then(function (res) {
				console.log('HELLO BRO!!');
				fs.writeFileSync('./ci2.html', citilink._scrape);
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
});

describe('Cache prices for Citilink', function() {
	this.timeout(80000);
	describe.skip('getCheapestInRow, getAllCheapest', function () {
		{//init
			var citilink = new Citilink(mockBody, mockDataCitilink);
		}
		it('should return an array of object with ori, dst, class and flight property', function (next) {
			var cheapest = citilink.getCheapestInRow(row);
			debug('cheapest',cheapest)
			expect(cheapest[0].class).to.eq("Q0.1");
			next();
		});
		it('should return an array cheapest class', function (next) {
			var flightClasses = citilink.getAllCheapest(rows);
			debug('flightClasses',flightClasses);
			expect(Object.keys(flightClasses).length).to.gt(0);
			next();
		});
	});

	describe('merge', function() {
		it('should get all cheapest seat per row, get prices data from db or scrape if necessary and return it after merged', function (done) {
			var json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
			var citilink = new Citilink(mockBody, mockDataCitilink);
			citilink.merge(json)
				.then(function (res) {
					debug(res);
					fs.writeFileSync(resultFile, JSON.stringify(res,null, 2));
					done();
				}, done);
		});
	});
});
