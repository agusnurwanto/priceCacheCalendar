var expect = require('chai').expect;
var fs = require('fs');
var path = require('path');
var Garuda = require('../../index')('garuda');
var jsonFile = path.resolve(__dirname, 'cgk-sub-rt.json');
var resultFile = path.resolve(__dirname, 'result.json');

var mockBody = {dep_date: "06+09+2015", ret_date: "12+09+2015", ori: 'CGK', dst: 'SUB'};
// var mockDataGaruda = fs.readFileSync('./ex.html', 'utf8');
var mockDataGaruda = '';

var debug       = require('debug')('raabbajam:priceCacheCalendar:test:garuda:spec');
describe.skip('Price Generator for Garuda', function () {
	this.timeout(20000);
	it('should extend base', function (next) {
		var garuda = new Garuda(mockBody, mockDataGaruda);
		expect(garuda.name).to.equal('garuda');
		next();
	});
	it('should return cache', function (next) {
		var garuda = new Garuda(mockBody, mockDataGaruda);
		garuda.getCache()
			.then(function () {
				expect(garuda.cache[mockBody.ori.toLowerCase()+mockBody.dst.toLowerCase()]).to.exist;
				// debug(garuda.cache);
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
	it('should loop get all routes', function (next) {
		var garuda = new Garuda(mockBody, mockDataGaruda);
		var routes = garuda.getAllRoutes();
		debug('routes',routes);
		expect(routes.length).gt(0);
		next();
	});
	it('should get all routes cache', function (next) {
		var garuda = new Garuda(mockBody, mockDataGaruda);
		var routes = garuda.getAllRoutes();
		garuda.getAllCaches(routes)
			.then(function () {
				debug('garuda.cache',garuda.cache);
				expect(garuda.cache).not.eq({});
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
	it('should merge all cache', function (next) {
		var garuda = new Garuda(mockBody, mockDataGaruda);
		var routes = garuda.getAllRoutes();
		garuda.getAllCaches(routes)
			.then(garuda.mergeCache.bind(garuda))
			.then(function (res) {
				// debug(JSON.stringify(garuda._scrape, null, 2));
				debug('lowestPrices', JSON.stringify(res, null, 2));
				debug(garuda.cache);
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
	it('should compare with db and insert to db if cheaper, for all lowest price', function (next) {
		var garuda = new Garuda(mockBody, mockDataGaruda);
		var routes = garuda.getAllRoutes();
		garuda.getAllCaches(routes)
			.then(garuda.mergeCache.bind(garuda))
			.then(garuda.insertAllLowest.bind(garuda))
			.then(function (res) {
				console.log('HELLO BRO!!');
				fs.writeFileSync('./ci2.html', garuda._scrape);
				next();
			})
			.catch(function (err) {
				next(err);
			});
	});
});

describe('Cache prices for Garuda', function() {
	this.timeout(80000);
	describe.skip('getCheapestInRow, getAllCheapest', function () {
		{//i
			var garuda = new Garuda(mockBody, mockDataGaruda);
		}
		it('should return an array of object with ori, dst, class and flight property', function (next) {
			var cheapest = garuda.getCheapestInRow(row);
			debug('cheapest',cheapest)
			expect(cheapest[0].class).to.eq("Q0.1");
			next();
		});
		it('should return an array cheapest class', function (next) {
			var flightClasses = garuda.getAllCheapest(rows);
			debug('flightClasses',flightClasses);
			expect(Object.keys(flightClasses).length).to.gt(0);
			next();
		});
	});
	describe('merge', function() {
		it('should get all cheapest seat per row, get prices data from db or scrape if necessary and return it after merged', function (done) {
			var json = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
			var garuda = new Garuda(mockBody, 'mockDataGaruda');
			// console.log(mockBody, garuda._dt)
			garuda.merge(json)
				.then(function (res) {
					// debug(res);
					fs.writeFileSync(resultFile, JSON.stringify(res,null, 2));
					done();
				}, done);
		});
	});
});
