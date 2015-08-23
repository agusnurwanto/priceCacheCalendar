var Base = require('../Base');
var moment = require('moment');
var debug = require('debug')('raabbajam:priceCacheCalendar:kalstar');
var _ = require('lodash');
var db = require('../libs/db');
var priceScrapers = require('priceScraper');
var TriganaPriceScrapers = priceScrapers.kalstar;
var cheerio = require('cheerio');
var Promise = require('bluebird');

function init(dt, scrape, args) {
	this._super('kalstar', dt, scrape, args);
	this.parallel = false;
	this._this = args._this;
}

function getAllRoutes() {
	var _this = this;
	var routes = [];
	var json = _this._scrape;
	var rows = [].concat(_.values(json.schedule[0]), _.values(json.ret_schedule[0]));
	rows.forEach(function(row) {
		var departCity = row[1];
		var arriveCity = row[2];
		if (!departCity && !arriveCity)
			return true;
		var currentRoute = departCity + arriveCity;
		currentRoute = currentRoute.toLowerCase();
		if (routes.indexOf(currentRoute) === -1) {
			routes.push(currentRoute);
		}
	});
	return routes;
}

function mergeCache() {
	var _this = this;
	var json = _this._scrape;
	function looper(dir, num) {
		var rows = _.values(json[dir][num]);
		if(!rows[0]){
			return rows;
		}
		if( rows[0][0][0][0] && rows[0][0][0][0].length>1 ){
			// rows = rows[0][0];
			rows[0].each(function(row){
				row = _this.generatePrice(row);
				return row;
			})
		}else if( rows[0][0][0].length>1 ){
			rows = _this.generatePrice(rows[0]);
		}else{
			rows = _this.generatePrice(rows);
		}
		return rows;
	}
	json.schedule[0] = looper('schedule', 0);
	json.schedule[1] = looper('schedule', 1);
	if (!!json.ret_schedule){
		json.ret_schedule[0] = looper('ret_schedule', 0);
		json.ret_schedule[1] = looper('ret_schedule', 1);
	}
	this._scrape = json;
	return this._scrape;
}
	/**
	 * return an array of object with ori, dst, class and flight property
	 * @param  {Object} row Row object
	 * @return {Array}     An array of object with ori, dst, class and flight property
	 */
function getCheapestInRow(_row) {
	var outs = [];
	var _this = this;
	var depPrice, retPrice;
	_this._scrape.cachePrice ? depPrice = _this._scrape.cachePrice.dep:'';
	_this._scrape.cachePrice ? retPrice = _this._scrape.cachePrice.ret:'';
	if(_row[0][0][0] && _row[0][0][0].length>1){
		_.each(_row, function(_ow){
			_.each(_ow, function(ow){
				if(depPrice){
					var dataDep = { price:0 };
					_.each(depPrice,function(cache){
						if(ow[1].toLowerCase()==cache.origin 
							&& ow[2].toLowerCase()==cache.destination
							&& ow[0].toLowerCase()==cache.flight){
							if(dataDep.price==0 || dataDep.price>cache.price){
								dataDep = cache;
							}
						}
					});
					if(dataDep.class)
						outs.push({ ori:ow[1], dst:ow[2], flight:ow[0], class: dataDep.class });
					if(retPrice){
						var dataRet = { price:0 };
						_.each(retPrice,function(cache){
							if(ow[1].toLowerCase()==cache.origin
								&& ow[2].toLowerCase()==cache.destination
								&& ow[0].toLowerCase()==cache.flight){
								if(dataRet.price==0 || dataRet.price>cache.price){
									dataRet = cache;
								}
							}
						});
						if(dataRet.class)
							outs.push({ ori:ow[1], dst:ow[2], flight:ow[0], class: dataRet.class });
					}
				}else{
					var __row = ow[10];
					__row = __row instanceof Array ? __row : [__row];
					_.each(__row, function (row) {
						var available = row[1].match(/\d+/);
						if(row[1].indexOf('A')!='-1' || (available && available[0] > 0)){
							var out = {
								ori: ow[1],
								dst: ow[2],
								flight: ow[0],
								class: row[0],
							};
							outs.push(out);
							return false;
						}
					});
				}
			});
		});
	}else if(_row[0][0].length>1){
		_.each(_row, function(ow){
			if(depPrice){
				var dataDep = { price:0 };
				_.each(depPrice,function(cache){
					if(ow[1].toLowerCase()==cache.origin
						&& ow[2].toLowerCase()==cache.destination
						&& ow[0].toLowerCase()==cache.flight){
						if(dataDep.price==0 || dataDep.price>cache.price){
							dataDep = cache;
						}
					}
				});
				if(dataDep.class)
					outs.push({ ori:ow[1], dst:ow[2], flight:ow[0], class: dataDep.class });
				if(retPrice){
					var dataRet = { price:0 };
					_.each(retPrice,function(cache){
						if(ow[1].toLowerCase()==cache.origin
							&& ow[2].toLowerCase()==cache.destination
							&& ow[0].toLowerCase()==cache.flight){
							if(dataRet.price==0 || dataRet.price>cache.price){
								dataRet = cache;
							}
						}
					});
					if(dataRet.class)
						outs.push({ ori:ow[1], dst:ow[2], flight:ow[0], class: dataRet.class });
				}
			}else{
				var __row = ow[10];
				__row = __row instanceof Array ? __row : [__row];
				_.each(__row, function (row) {
					var available = row[1].match(/\d+/);
					if(row[1].indexOf('A')!='-1' || (available && available[0] > 0)){
						var out = {
							ori: ow[1],
							dst: ow[2],
							flight: ow[0],
							class: row[0],
						};
						outs.push(out);
						return false;
					}
				});
			}
		});
	}else{
		if(depPrice){
			var dataDep = { price:0 };
			_.each(depPrice,function(cache){
				if(_row[1].toLowerCase()==cache.origin
					&& _row[2].toLowerCase()==cache.destination
					&& _row[0].toLowerCase()==cache.flight){
					if(dataDep.price==0 || dataDep.price>cache.price){
						dataDep = cache;
					}
				}
			});
			if(dataDep.class)
				outs.push({ ori:_row[1], dst:_row[2], flight:_row[0], class: dataDep.class });
			if(retPrice){
				var dataRet = { price:0 };
				_.each(retPrice,function(cache){
					if(_row[1].toLowerCase()==cache.origin
						&& _row[2].toLowerCase()==cache.destination
						&& _row[0].toLowerCase()==cache.flight){
						if(dataRet.price==0 || dataRet.price>cache.price){
							dataRet = cache;
						}
					}
				});
				if(dataRet.class)
					outs.push({ ori:_row[1], dst:_row[2], flight:_row[0], class: dataRet.class });
			}
		}else{
			var __row = _row[10];
				__row = __row instanceof Array ? __row : [__row];
				_.each(__row, function (row) {
					var available = row[1].match(/\d+/);
					if(row[1].indexOf('A')!='-1' || (available && available[0] > 0)){
						var out = {
							ori: _row[1],
							dst: _row[2],
							flight: _row[0],
							class: row[0],
						};
						outs.push(out);
						return false;
					}
				});
		}
	}
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
		var passengersNum = (+this._dt.adult) + (+this._dt.child);
		debug('passengersNum', passengersNum);
		var dep_date = this._dt.dep_date.replace(/\s/g, '+');
		// if RT
		if(_id[0].toUpperCase() != this._dt.ori.toUpperCase()){
			dep_date = this._dt.ret_date.replace(/\s/g, '+');
		}
		var data = {
			// ori: _this._dt.ori.toUpperCase(),
			ori: _id[0].toUpperCase(),
			dst: _id[1].toUpperCase(),
			airline: _id[2],
			adult: this._dt.adult,
			child: this._dt.child,
			infant: this._dt.infant,
			flightCode: _id[3].toUpperCase(),
			classCode: _id[4].toUpperCase(),
			passengersNum: passengersNum,
			cek_instant: 1,
			dep_date: dep_date,
			rute: 'OW',
			dep_radio: _id[3].toUpperCase()+'-'+_id[4].toUpperCase(),
			action: 'price',
			user: this._dt.user,
			priceScraper: false,
			xToken: this._dt.xToken,
			scraperPrice: true,
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
	debug('scrapeLostData', ids);
	var _this = this;
	var dt = _this.generateData(ids);
	var passengersNum = (+this._dt.adult) + (+this._dt.child);
    _this.modes = _this._this.defaultModes || [passengersNum+'00'];
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
    _this._this.data.query.adult = options.mode[0];
    _this._this.data.query.child = options.mode[1];
    _this._this.data.query.infant = options.mode[2];
	return new Promise(function(resolve, reject){
		_this.getCache(options, 'idsDep', resolve);
	});
}

function getCache(options, note, resolve){
	debug('getCache');
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
    }
    if(!_this.relogModesId && !_this.relogModes && (note=='idsRet' || _this.oriData.rute.toLowerCase()!='rt')){
    	return resolve();
    }
    debug('getCache2')
    _this.getPrice(_this.relogModesId, that, note)
    .then(function(res){
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

function getPrice(_dt, that, note){
	debug('getPrice')
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
                if(!_this.relogModes){
                	results.fare_info.reduce(function(prev, next){
                		return prev.then(function(){
	                		var _class = next[0].split('/');
			            	var radio = _data.dep_radio.split('_')[0].split('-');
			            	_data.dep_radio = radio[0]+'-'+radio[1]+'_'+_class[0].toLowerCase();
			            	return new Promise(function(resove, reject){
			                    _this.saveCache(next, _data, function(err, res){
			                    	if(note=='idsDep')
	                					that.cachePrice.dep.push(res);
	                				else
	                					that.cachePrice.ret.push(res);
			                        resove(res);
			                    });
			                })
                		})
			            .catch(function(err){
			                debug(err.stack);
			                return Promise.resolve(err);
			            });
                	}, Promise.resolve(true))
                	.then(function(res){
                		return resl(res);
                	})
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

function calculateAdult(results, dt) {
	var _X01 = results[1][0];
	return _X01 / dt.passengersNum;
}
function calculateChild(results, dt) {
	var _X01 = results[2][0];
	return _X01 / dt.passengersNum;
}
function calculateInfant(results, dt) {
	var _X01 = results[3][0];
	return _X01 / dt.passengersNum;
}
function calculateBasic(results, dt) {
	var _X01 = results[1][1];	
	return _X01 / dt.passengersNum;
}

/**
 * Merge json data with cheapest data from db
 * @param  {Object} json JSON formatted of scraped data
 * @return {Object}      JSON formatted of scraped data already merged with cache data
 */
function mergeCachePrices(json) {
	var _this = this;
	var json = JSON.parse(json);
	function looper(dir, num) {
		var rows = _.values(json[dir][num]);
		if(!rows[0]){
			return rows;
		}
		if( rows[0][0][0] && rows[0][0][0].length>1 ){
			rows.forEach(function(row){
				return _this.generatePrice(row);
			})
		}else{
			rows = _this.generatePrice(rows);
		}
		return rows;
	}
	json.schedule[0] = looper('schedule', 0);
	json.schedule[1] = looper('schedule', 1);
	if (!!json.ret_schedule){
		json.ret_schedule[0] = looper('ret_schedule', 0);
		json.ret_schedule[1] = looper('ret_schedule', 1);
	}
	return json;
}

function generatePrice(rows){
	var _this = this;
	var _this = this;
	var depPrice, retPrice;
	_this._scrape.cachePrice ? depPrice = _this._scrape.cachePrice.dep:'';
	_this._scrape.cachePrice ? retPrice = _this._scrape.cachePrice.ret:'';
	rows.forEach(function(row) {
		var cheapest = {
			class: 'Full',
			available: 0
		};
		var departCity = row[1];
		var arriveCity = row[2];
		var flight = row[0].toLowerCase();
		if (!departCity && !arriveCity){
			row.push(cheapest);
			return true;
		}
		var currentRoute = departCity + arriveCity;
		currentRoute = currentRoute.toLowerCase();
		if (!_this.cachePrices[currentRoute]){
			row.push(cheapest);
			return true;
		}
		var __class = '';
		var available = '';
		if(depPrice){
			_.each(depPrice,function(cache){
				if(row[1].toLowerCase()==cache.origin 
					&& row[2].toLowerCase()==cache.destination
					&& flight==cache.flight){
					row[10].some(function(row_class){
						__class = row_class[0].toLowerCase();
						available = row_class[1];
						if(__class==cache.class 
							&& flight==cache.flight 
							&& _this.cachePrices[currentRoute]
							&& _this.cachePrices[currentRoute][flight]
							&& _this.cachePrices[currentRoute][flight][__class]){
							cheapest = _this.cachePrices[currentRoute][flight][__class];
							cheapest.class = __class;
							cheapest.available = available;
							row.push({ cheapest: cheapest });
							return row;
						}
					});
					return row;
				}
			});
			if(retPrice){
				_.each(retPrice,function(cache){
					if(row[1].toLowerCase()==cache.origin 
						&& row[2].toLowerCase()==cache.destination
						&& flight==cache.flight){
						row[10].some(function(row_class){
							__class = row_class[0].toLowerCase();
							available = row_class[1];
							if(__class==cache.class 
								&& flight==cache.flight 
								&& _this.cachePrices[currentRoute]
								&& _this.cachePrices[currentRoute][flight]
								&& _this.cachePrices[currentRoute][flight][__class]){
								cheapest = _this.cachePrices[currentRoute][flight][__class];
								cheapest.class = __class;
								cheapest.available = available;
								row.push({ cheapest: cheapest });
								return row;
							}
						});
						return row;
					}
				});
			}
			if (!__class){
				row.push(cheapest);
				return true;
			}
			return row;
		}
		row[10].some(function(row_class){
			available = row_class[1];
			var availableNum = available.match(/\d+/);
			if(available=='A' || (availableNum && +availableNum[0]>=0)){
				__class = row_class[0].toLowerCase();
				debug('row', __class, available);
				return true;
			}
		});
		if (!__class){
			row.push(cheapest);
			return true;
		}
		debug('_this.cachePrices[currentRoute]', _this.cachePrices[currentRoute], flight, __class);
		cheapest = _this.cachePrices[currentRoute][flight][__class];
		cheapest.class = __class;
		cheapest.available = available;
		row.push({ cheapest: cheapest });
		return row;
	});
	return rows;
}

/**
 * Preparing rows to be looped on process
 * @param  {Object} json JSON formatted data from scraping
 * @return {Object}      Array of rows to be looped for getAkkCheaoest function
 */
function prepareRows(json) {
	var _json = _.cloneDeep(JSON.parse(json));
	var rows = [];
	rows = rows.concat(
			_.values(_json.schedule[0]), 
			_.values(_json.schedule[1]), 
			_.values(_json.ret_schedule[0]), 
			_.values(_json.ret_schedule[1])
		);
	return rows;
}

function getCalendarPrice(json) {
	var _this = this;
	var format = ['YYYY-MM-DD', 'DD MM YYYY', 'DD+MM+YYYY'];
	var format2 = ['M/DD/YYYY H:mm', 'DD MM YYYY HH:mm', 'DD+MM+YYYY HH:mm'];
	return new Promise(function(resolve, reject) {
		return resolve(0);
		if (!json.schedule)
			return resolve();
		var dep_date = _this.dt.dep_date;
		var date = moment(dep_date, format);
		var dayRangeForExpiredCheck = 2;
		var checkDate = moment()
			.add(dayRangeForExpiredCheck, 'day');
		_this.isSameDay = false;
		if (date.isBefore(checkDate, 'day'))
			_this.isSameDay = true;
		debug('_this.isSameDay %s', _this.isSameDay);
		var cheapests = [];
		function looper(dir) {
			var rows = _.values(json[dir][0]);
			rows.forEach(function(row) {
				var departCity = row[1];
				var arriveCity = row[2];
				if (!departCity && !arriveCity)
					return true;
				debug('depart %s', flight.depart);
				var depart = moment(flight.depart, format2);
				if (_this.isBookable(depart)){
					try{
						if (flight.cheapest){
							cheapests.push(flight.cheapest);
						}else{
							debug('cheapests', flight.cheapest);
						}
					}catch(e){
						debug('cheapests', flight.cheapest);
					}
				}
			});
			return rows;
		}
		looper('schedule');
		if (!!json.ret_schedule)
			looper('ret_schedule');

		// debug('before filter %d', _.size(json.departure));
		debug('after filter %d', cheapests.length);
		var cheapestFlight = _.min(cheapests, function(cheapest, i) {
			debug('cheapests: %j', cheapest.adult);
			return cheapest.adult;
		});
		return resolve(cheapestFlight);
	});
}

var TriganaPrototype = {
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
	generatePrice: generatePrice,
};
var Trigana = Base.extend(TriganaPrototype);
module.exports = Trigana;

// utils
function isFull(seat) {
	var fulls = ['full', 'penuh'];
	var _seat = seat.toLowerCase();
	return !!~fulls.indexOf(_seat);
}
