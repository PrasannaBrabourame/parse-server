"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LoggerController = exports.LogOrder = exports.LogLevel = void 0;

var _node = require("parse/node");

var _AdaptableController = _interopRequireDefault(require("./AdaptableController"));

var _LoggerAdapter = require("../Adapters/Logger/LoggerAdapter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;
const LOG_STRING_TRUNCATE_LENGTH = 1000;
const truncationMarker = '... (truncated)';
const LogLevel = {
  INFO: 'info',
  ERROR: 'error'
};
exports.LogLevel = LogLevel;
const LogOrder = {
  DESCENDING: 'desc',
  ASCENDING: 'asc'
};
exports.LogOrder = LogOrder;
const logLevels = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];

class LoggerController extends _AdaptableController.default {
  constructor(adapter, appId, options = {
    logLevel: 'info'
  }) {
    super(adapter, appId, options);
    let level = 'info';

    if (options.verbose) {
      level = 'verbose';
    }

    if (options.logLevel) {
      level = options.logLevel;
    }

    const index = logLevels.indexOf(level); // info by default

    logLevels.forEach((level, levelIndex) => {
      if (levelIndex > index) {
        // silence the levels that are > maxIndex
        this[level] = () => {};
      }
    });
  }

  maskSensitiveUrl(path) {
    const urlString = 'http://localhost' + path; // prepend dummy string to make a real URL

    const urlObj = new URL(urlString);
    const query = urlObj.searchParams;
    let sanitizedQuery = '?';

    for (const [key, value] of query) {
      if (key !== 'password') {
        // normal value
        sanitizedQuery += key + '=' + value + '&';
      } else {
        // password value, redact it
        sanitizedQuery += key + '=' + '********' + '&';
      }
    } // trim last character, ? or &


    sanitizedQuery = sanitizedQuery.slice(0, -1); // return original path name with sanitized params attached

    return urlObj.pathname + sanitizedQuery;
  }

  maskSensitive(argArray) {
    return argArray.map(e => {
      if (!e) {
        return e;
      }

      if (typeof e === 'string') {
        return e.replace(/(password".?:.?")[^"]*"/g, '$1********"');
      } // else it is an object...
      // check the url


      if (e.url) {
        // for strings
        if (typeof e.url === 'string') {
          e.url = this.maskSensitiveUrl(e.url);
        } else if (Array.isArray(e.url)) {
          // for strings in array
          e.url = e.url.map(item => {
            if (typeof item === 'string') {
              return this.maskSensitiveUrl(item);
            }

            return item;
          });
        }
      }

      if (e.body) {
        for (const key of Object.keys(e.body)) {
          if (key === 'password') {
            e.body[key] = '********';
            break;
          }
        }
      }

      if (e.params) {
        for (const key of Object.keys(e.params)) {
          if (key === 'password') {
            e.params[key] = '********';
            break;
          }
        }
      }

      return e;
    });
  }

  log(level, args) {
    // make the passed in arguments object an array with the spread operator
    args = this.maskSensitive([...args]);
    args = [].concat(level, args.map(arg => {
      if (typeof arg === 'function') {
        return arg();
      }

      return arg;
    }));
    this.adapter.log.apply(this.adapter, args);
  }

  info() {
    return this.log('info', arguments);
  }

  error() {
    return this.log('error', arguments);
  }

  warn() {
    return this.log('warn', arguments);
  }

  verbose() {
    return this.log('verbose', arguments);
  }

  debug() {
    return this.log('debug', arguments);
  }

  silly() {
    return this.log('silly', arguments);
  }

  logRequest({
    method,
    url,
    headers,
    body
  }) {
    this.verbose(() => {
      const stringifiedBody = JSON.stringify(body, null, 2);
      return `REQUEST for [${method}] ${url}: ${stringifiedBody}`;
    }, {
      method,
      url,
      headers,
      body
    });
  }

  logResponse({
    method,
    url,
    result
  }) {
    this.verbose(() => {
      const stringifiedResponse = JSON.stringify(result, null, 2);
      return `RESPONSE from [${method}] ${url}: ${stringifiedResponse}`;
    }, {
      result: result
    });
  } // check that date input is valid


  static validDateTime(date) {
    if (!date) {
      return null;
    }

    date = new Date(date);

    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  }

  truncateLogMessage(string) {
    if (string && string.length > LOG_STRING_TRUNCATE_LENGTH) {
      const truncated = string.substring(0, LOG_STRING_TRUNCATE_LENGTH) + truncationMarker;
      return truncated;
    }

    return string;
  }

  static parseOptions(options = {}) {
    const from = LoggerController.validDateTime(options.from) || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
    const until = LoggerController.validDateTime(options.until) || new Date();
    const size = Number(options.size) || 10;
    const order = options.order || LogOrder.DESCENDING;
    const level = options.level || LogLevel.INFO;
    return {
      from,
      until,
      size,
      order,
      level
    };
  } // Returns a promise for a {response} object.
  // query params:
  // level (optional) Level of logging you want to query for (info || error)
  // from (optional) Start time for the search. Defaults to 1 week ago.
  // until (optional) End time for the search. Defaults to current time.
  // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
  // size (optional) Number of rows returned by search. Defaults to 10


  getLogs(options = {}) {
    if (!this.adapter) {
      throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not available');
    }

    if (typeof this.adapter.query !== 'function') {
      throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Querying logs is not supported with this adapter');
    }

    options = LoggerController.parseOptions(options);
    return this.adapter.query(options);
  }

  expectedAdapterType() {
    return _LoggerAdapter.LoggerAdapter;
  }

}

exports.LoggerController = LoggerController;
var _default = LoggerController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9Mb2dnZXJDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIk1JTExJU0VDT05EU19JTl9BX0RBWSIsIkxPR19TVFJJTkdfVFJVTkNBVEVfTEVOR1RIIiwidHJ1bmNhdGlvbk1hcmtlciIsIkxvZ0xldmVsIiwiSU5GTyIsIkVSUk9SIiwiTG9nT3JkZXIiLCJERVNDRU5ESU5HIiwiQVNDRU5ESU5HIiwibG9nTGV2ZWxzIiwiTG9nZ2VyQ29udHJvbGxlciIsIkFkYXB0YWJsZUNvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsImFkYXB0ZXIiLCJhcHBJZCIsIm9wdGlvbnMiLCJsb2dMZXZlbCIsImxldmVsIiwidmVyYm9zZSIsImluZGV4IiwiaW5kZXhPZiIsImZvckVhY2giLCJsZXZlbEluZGV4IiwibWFza1NlbnNpdGl2ZVVybCIsInBhdGgiLCJ1cmxTdHJpbmciLCJ1cmxPYmoiLCJVUkwiLCJxdWVyeSIsInNlYXJjaFBhcmFtcyIsInNhbml0aXplZFF1ZXJ5Iiwia2V5IiwidmFsdWUiLCJzbGljZSIsInBhdGhuYW1lIiwibWFza1NlbnNpdGl2ZSIsImFyZ0FycmF5IiwibWFwIiwiZSIsInJlcGxhY2UiLCJ1cmwiLCJBcnJheSIsImlzQXJyYXkiLCJpdGVtIiwiYm9keSIsIk9iamVjdCIsImtleXMiLCJwYXJhbXMiLCJsb2ciLCJhcmdzIiwiY29uY2F0IiwiYXJnIiwiYXBwbHkiLCJpbmZvIiwiYXJndW1lbnRzIiwiZXJyb3IiLCJ3YXJuIiwiZGVidWciLCJzaWxseSIsImxvZ1JlcXVlc3QiLCJtZXRob2QiLCJoZWFkZXJzIiwic3RyaW5naWZpZWRCb2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsImxvZ1Jlc3BvbnNlIiwicmVzdWx0Iiwic3RyaW5naWZpZWRSZXNwb25zZSIsInZhbGlkRGF0ZVRpbWUiLCJkYXRlIiwiRGF0ZSIsImlzTmFOIiwiZ2V0VGltZSIsInRydW5jYXRlTG9nTWVzc2FnZSIsInN0cmluZyIsImxlbmd0aCIsInRydW5jYXRlZCIsInN1YnN0cmluZyIsInBhcnNlT3B0aW9ucyIsImZyb20iLCJub3ciLCJ1bnRpbCIsInNpemUiLCJOdW1iZXIiLCJvcmRlciIsImdldExvZ3MiLCJQYXJzZSIsIkVycm9yIiwiUFVTSF9NSVNDT05GSUdVUkVEIiwiZXhwZWN0ZWRBZGFwdGVyVHlwZSIsIkxvZ2dlckFkYXB0ZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVBLE1BQU1BLHFCQUFxQixHQUFHLEtBQUssRUFBTCxHQUFVLEVBQVYsR0FBZSxJQUE3QztBQUNBLE1BQU1DLDBCQUEwQixHQUFHLElBQW5DO0FBQ0EsTUFBTUMsZ0JBQWdCLEdBQUcsaUJBQXpCO0FBRU8sTUFBTUMsUUFBUSxHQUFHO0FBQ3RCQyxFQUFBQSxJQUFJLEVBQUUsTUFEZ0I7QUFFdEJDLEVBQUFBLEtBQUssRUFBRTtBQUZlLENBQWpCOztBQUtBLE1BQU1DLFFBQVEsR0FBRztBQUN0QkMsRUFBQUEsVUFBVSxFQUFFLE1BRFU7QUFFdEJDLEVBQUFBLFNBQVMsRUFBRTtBQUZXLENBQWpCOztBQUtQLE1BQU1DLFNBQVMsR0FBRyxDQUFDLE9BQUQsRUFBVSxNQUFWLEVBQWtCLE1BQWxCLEVBQTBCLE9BQTFCLEVBQW1DLFNBQW5DLEVBQThDLE9BQTlDLENBQWxCOztBQUVPLE1BQU1DLGdCQUFOLFNBQStCQyw0QkFBL0IsQ0FBbUQ7QUFDeERDLEVBQUFBLFdBQVcsQ0FBQ0MsT0FBRCxFQUFVQyxLQUFWLEVBQWlCQyxPQUFPLEdBQUc7QUFBRUMsSUFBQUEsUUFBUSxFQUFFO0FBQVosR0FBM0IsRUFBaUQ7QUFDMUQsVUFBTUgsT0FBTixFQUFlQyxLQUFmLEVBQXNCQyxPQUF0QjtBQUNBLFFBQUlFLEtBQUssR0FBRyxNQUFaOztBQUNBLFFBQUlGLE9BQU8sQ0FBQ0csT0FBWixFQUFxQjtBQUNuQkQsTUFBQUEsS0FBSyxHQUFHLFNBQVI7QUFDRDs7QUFDRCxRQUFJRixPQUFPLENBQUNDLFFBQVosRUFBc0I7QUFDcEJDLE1BQUFB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QUNMMkUsTUFBQUEsSUFESztBQUVMRSxNQUFBQSxLQUZLO0FBR0xDLE1BQUFBLElBSEs7QUFJTEUsTUFBQUEsS0FKSztBQUtMbkUsTUFBQUE7QUFMSyxLQUFQO0FBT0QsR0FsTXVELENBb014RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FBQ0FvRSxFQUFBQSxPQUFPLENBQUN0RSxPQUFPLEdBQUcsRUFBWCxFQUFlO0FBQ3BCLFFBQUksQ0FBQyxLQUFLRixPQUFWLEVBQW1CO0FBQ2pCLFlBQU0sSUFBSXlFLFlBQU1DLEtBQVYsQ0FBZ0JELFlBQU1DLEtBQU4sQ0FBWUMsa0JBQTVCLEVBQWdELGlDQUFoRCxDQUFOO0FBQ0Q7O0FBQ0QsUUFBSSxPQUFPLEtBQUszRSxPQUFMLENBQWFlLEtBQXBCLEtBQThCLFVBQWxDLEVBQThDO0FBQzVDLFlBQU0sSUFBSTBELFlBQU1DLEtBQVYsQ0FDSkQsWUFBTUMsS0FBTixDQUFZQyxrQkFEUixFQUVKLGtEQUZJLENBQU47QUFJRDs7QUFDRHpFLElBQUFBLE9BQU8sR0FBR0wsZ0JBQWdCLENBQUNvRSxZQUFqQixDQUE4Qi9ELE9BQTlCLENBQVY7QUFDQSxXQUFPLEtBQUtGLE9BQUwsQ0FBYWUsS0FBYixDQUFtQmIsT0FBbkIsQ0FBUDtBQUNEOztBQUVEMEUsRUFBQUEsbUJBQW1CLEdBQUc7QUFDcEIsV0FBT0MsNEJBQVA7QUFDRDs7QUEzTnVEOzs7ZUE4TjNDaEYsZ0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZSB9IGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IEFkYXB0YWJsZUNvbnRyb2xsZXIgZnJvbSAnLi9BZGFwdGFibGVDb250cm9sbGVyJztcbmltcG9ydCB7IExvZ2dlckFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9Mb2dnZXIvTG9nZ2VyQWRhcHRlcic7XG5cbmNvbnN0IE1JTExJU0VDT05EU19JTl9BX0RBWSA9IDI0ICogNjAgKiA2MCAqIDEwMDA7XG5jb25zdCBMT0dfU1RSSU5HX1RSVU5DQVRFX0xFTkdUSCA9IDEwMDA7XG5jb25zdCB0cnVuY2F0aW9uTWFya2VyID0gJy4uLiAodHJ1bmNhdGVkKSc7XG5cbmV4cG9ydCBjb25zdCBMb2dMZXZlbCA9IHtcbiAgSU5GTzogJ2luZm8nLFxuICBFUlJPUjogJ2Vycm9yJyxcbn07XG5cbmV4cG9ydCBjb25zdCBMb2dPcmRlciA9IHtcbiAgREVTQ0VORElORzogJ2Rlc2MnLFxuICBBU0NFTkRJTkc6ICdhc2MnLFxufTtcblxuY29uc3QgbG9nTGV2ZWxzID0gWydlcnJvcicsICd3YXJuJywgJ2luZm8nLCAnZGVidWcnLCAndmVyYm9zZScsICdzaWxseSddO1xuXG5leHBvcnQgY2xhc3MgTG9nZ2VyQ29udHJvbGxlciBleHRlbmRzIEFkYXB0YWJsZUNvbnRyb2xsZXIge1xuICBjb25zdHJ1Y3RvcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyA9IHsgbG9nTGV2ZWw6ICdpbmZvJyB9KSB7XG4gICAgc3VwZXIoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMpO1xuICAgIGxldCBsZXZlbCA9ICdpbmZvJztcbiAgICBpZiAob3B0aW9ucy52ZXJib3NlKSB7XG4gICAgICBsZXZlbCA9ICd2ZXJib3NlJztcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMubG9nTGV2ZWwpIHtcbiAgICAgIGxldmVsID0gb3B0aW9ucy5sb2dMZXZlbDtcbiAgICB9XG4gICAgY29uc3QgaW5kZXggPSBsb2dMZXZlbHMuaW5kZXhPZihsZXZlbCk7IC8vIGluZm8gYnkgZGVmYXVsdFxuICAgIGxvZ0xldmVscy5mb3JFYWNoKChsZXZlbCwgbGV2ZWxJbmRleCkgPT4ge1xuICAgICAgaWYgKGxldmVsSW5kZXggPiBpbmRleCkge1xuICAgICAgICAvLyBzaWxlbmNlIHRoZSBsZXZlbHMgdGhhdCBhcmUgPiBtYXhJbmRleFxuICAgICAgICB0aGlzW2xldmVsXSA9ICgpID0+IHt9O1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgbWFza1NlbnNpdGl2ZVVybChwYXRoKSB7XG4gICAgY29uc3QgdXJsU3RyaW5nID0gJ2h0dHA6Ly9sb2NhbGhvc3QnICsgcGF0aDsgLy8gcHJlcGVuZCBkdW1teSBzdHJpbmcgdG8gbWFrZSBhIHJlYWwgVVJMXG4gICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh1cmxTdHJpbmcpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gdXJsT2JqLnNlYXJjaFBhcmFtcztcbiAgICBsZXQgc2FuaXRpemVkUXVlcnkgPSAnPyc7XG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBxdWVyeSkge1xuICAgICAgaWYgKGtleSAhPT0gJ3Bhc3N3b3JkJykge1xuICAgICAgICAvLyBub3JtYWwgdmFsdWVcbiAgICAgICAgc2FuaXRpemVkUXVlcnkgKz0ga2V5ICsgJz0nICsgdmFsdWUgKyAnJic7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBwYXNzd29yZCB2YWx1ZSwgcmVkYWN0IGl0XG4gICAgICAgIHNhbml0aXplZFF1ZXJ5ICs9IGtleSArICc9JyArICcqKioqKioqKicgKyAnJic7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gdHJpbSBsYXN0IGNoYXJhY3RlciwgPyBvciAmXG4gICAgc2FuaXRpemVkUXVlcnkgPSBzYW5pdGl6ZWRRdWVyeS5zbGljZSgwLCAtMSk7XG5cbiAgICAvLyByZXR1cm4gb3JpZ2luYWwgcGF0aCBuYW1lIHdpdGggc2FuaXRpemVkIHBhcmFtcyBhdHRhY2hlZFxuICAgIHJldHVybiB1cmxPYmoucGF0aG5hbWUgKyBzYW5pdGl6ZWRRdWVyeTtcbiAgfVxuXG4gIG1hc2tTZW5zaXRpdmUoYXJnQXJyYXkpIHtcbiAgICByZXR1cm4gYXJnQXJyYXkubWFwKGUgPT4ge1xuICAgICAgaWYgKCFlKSB7XG4gICAgICAgIHJldHVybiBlO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBlLnJlcGxhY2UoLyhwYXNzd29yZFwiLj86Lj9cIilbXlwiXSpcIi9nLCAnJDEqKioqKioqKlwiJyk7XG4gICAgICB9XG4gICAgICAvLyBlbHNlIGl0IGlzIGFuIG9iamVjdC4uLlxuXG4gICAgICAvLyBjaGVjayB0aGUgdXJsXG4gICAgICBpZiAoZS51cmwpIHtcbiAgICAgICAgLy8gZm9yIHN0cmluZ3NcbiAgICAgICAgaWYgKHR5cGVvZiBlLnVybCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBlLnVybCA9IHRoaXMubWFza1NlbnNpdGl2ZVVybChlLnVybCk7XG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShlLnVybCkpIHtcbiAgICAgICAgICAvLyBmb3Igc3RyaW5ncyBpbiBhcnJheVxuICAgICAgICAgIGUudXJsID0gZS51cmwubWFwKGl0ZW0gPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5tYXNrU2Vuc2l0aXZlVXJsKGl0ZW0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZS5ib2R5KSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGUuYm9keSkpIHtcbiAgICAgICAgICBpZiAoa2V5ID09PSAncGFzc3dvcmQnKSB7XG4gICAgICAgICAgICBlLmJvZHlba2V5XSA9ICcqKioqKioqKic7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGUucGFyYW1zKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGUucGFyYW1zKSkge1xuICAgICAgICAgIGlmIChrZXkgPT09ICdwYXNzd29yZCcpIHtcbiAgICAgICAgICAgIGUucGFyYW1zW2tleV0gPSAnKioqKioqKionO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlO1xuICAgIH0pO1xuICB9XG5cbiAgbG9nKGxldmVsLCBhcmdzKSB7XG4gICAgLy8gbWFrZSB0aGUgcGFzc2VkIGluIGFyZ3VtZW50cyBvYmplY3QgYW4gYXJyYXkgd2l0aCB0aGUgc3ByZWFkIG9wZXJhdG9yXG4gICAgYXJncyA9IHRoaXMubWFza1NlbnNpdGl2ZShbLi4uYXJnc10pO1xuICAgIGFyZ3MgPSBbXS5jb25jYXQoXG4gICAgICBsZXZlbCxcbiAgICAgIGFyZ3MubWFwKGFyZyA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIGFyZygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcmc7XG4gICAgICB9KVxuICAgICk7XG4gICAgdGhpcy5hZGFwdGVyLmxvZy5hcHBseSh0aGlzLmFkYXB0ZXIsIGFyZ3MpO1xuICB9XG5cbiAgaW5mbygpIHtcbiAgICByZXR1cm4gdGhpcy5sb2coJ2luZm8nLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgZXJyb3IoKSB7XG4gICAgcmV0dXJuIHRoaXMubG9nKCdlcnJvcicsIGFyZ3VtZW50cyk7XG4gIH1cblxuICB3YXJuKCkge1xuICAgIHJldHVybiB0aGlzLmxvZygnd2FybicsIGFyZ3VtZW50cyk7XG4gIH1cblxuICB2ZXJib3NlKCkge1xuICAgIHJldHVybiB0aGlzLmxvZygndmVyYm9zZScsIGFyZ3VtZW50cyk7XG4gIH1cblxuICBkZWJ1ZygpIHtcbiAgICByZXR1cm4gdGhpcy5sb2coJ2RlYnVnJywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHNpbGx5KCkge1xuICAgIHJldHVybiB0aGlzLmxvZygnc2lsbHknLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgbG9nUmVxdWVzdCh7IG1ldGhvZCwgdXJsLCBoZWFkZXJzLCBib2R5IH0pIHtcbiAgICB0aGlzLnZlcmJvc2UoXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHN0cmluZ2lmaWVkQm9keSA9IEpTT04uc3RyaW5naWZ5KGJvZHksIG51bGwsIDIpO1xuICAgICAgICByZXR1cm4gYFJFUVVFU1QgZm9yIFske21ldGhvZH1dICR7dXJsfTogJHtzdHJpbmdpZmllZEJvZHl9YDtcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgdXJsLFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBib2R5LFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBsb2dSZXNwb25zZSh7IG1ldGhvZCwgdXJsLCByZXN1bHQgfSkge1xuICAgIHRoaXMudmVyYm9zZShcbiAgICAgICgpID0+IHtcbiAgICAgICAgY29uc3Qgc3RyaW5naWZpZWRSZXNwb25zZSA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMik7XG4gICAgICAgIHJldHVybiBgUkVTUE9OU0UgZnJvbSBbJHttZXRob2R9XSAke3VybH06ICR7c3RyaW5naWZpZWRSZXNwb25zZX1gO1xuICAgICAgfSxcbiAgICAgIHsgcmVzdWx0OiByZXN1bHQgfVxuICAgICk7XG4gIH1cbiAgLy8gY2hlY2sgdGhhdCBkYXRlIGlucHV0IGlzIHZhbGlkXG4gIHN0YXRpYyB2YWxpZERhdGVUaW1lKGRhdGUpIHtcbiAgICBpZiAoIWRhdGUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBkYXRlID0gbmV3IERhdGUoZGF0ZSk7XG5cbiAgICBpZiAoIWlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xuICAgICAgcmV0dXJuIGRhdGU7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB0cnVuY2F0ZUxvZ01lc3NhZ2Uoc3RyaW5nKSB7XG4gICAgaWYgKHN0cmluZyAmJiBzdHJpbmcubGVuZ3RoID4gTE9HX1NUUklOR19UUlVOQ0FURV9MRU5HVEgpIHtcbiAgICAgIGNvbnN0IHRydW5jYXRlZCA9IHN0cmluZy5zdWJzdHJpbmcoMCwgTE9HX1NUUklOR19UUlVOQ0FURV9MRU5HVEgpICsgdHJ1bmNhdGlvbk1hcmtlcjtcbiAgICAgIHJldHVybiB0cnVuY2F0ZWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0cmluZztcbiAgfVxuXG4gIHN0YXRpYyBwYXJzZU9wdGlvbnMob3B0aW9ucyA9IHt9KSB7XG4gICAgY29uc3QgZnJvbSA9XG4gICAgICBMb2dnZXJDb250cm9sbGVyLnZhbGlkRGF0ZVRpbWUob3B0aW9ucy5mcm9tKSB8fFxuICAgICAgbmV3IERhdGUoRGF0ZS5ub3coKSAtIDcgKiBNSUxMSVNFQ09ORFNfSU5fQV9EQVkpO1xuICAgIGNvbnN0IHVudGlsID0gTG9nZ2VyQ29udHJvbGxlci52YWxpZERhdGVUaW1lKG9wdGlvbnMudW50aWwpIHx8IG5ldyBEYXRlKCk7XG4gICAgY29uc3Qgc2l6ZSA9IE51bWJlcihvcHRpb25zLnNpemUpIHx8IDEwO1xuICAgIGNvbnN0IG9yZGVyID0gb3B0aW9ucy5vcmRlciB8fCBMb2dPcmRlci5ERVNDRU5ESU5HO1xuICAgIGNvbnN0IGxldmVsID0gb3B0aW9ucy5sZXZlbCB8fCBMb2dMZXZlbC5JTkZPO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZyb20sXG4gICAgICB1bnRpbCxcbiAgICAgIHNpemUsXG4gICAgICBvcmRlcixcbiAgICAgIGxldmVsLFxuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSB7cmVzcG9uc2V9IG9iamVjdC5cbiAgLy8gcXVlcnkgcGFyYW1zOlxuICAvLyBsZXZlbCAob3B0aW9uYWwpIExldmVsIG9mIGxvZ2dpbmcgeW91IHdhbnQgdG8gcXVlcnkgZm9yIChpbmZvIHx8IGVycm9yKVxuICAvLyBmcm9tIChvcHRpb25hbCkgU3RhcnQgdGltZSBmb3IgdGhlIHNlYXJjaC4gRGVmYXVsdHMgdG8gMSB3ZWVrIGFnby5cbiAgLy8gdW50aWwgKG9wdGlvbmFsKSBFbmQgdGltZSBmb3IgdGhlIHNlYXJjaC4gRGVmYXVsdHMgdG8gY3VycmVudCB0aW1lLlxuICAvLyBvcmRlciAob3B0aW9uYWwpIERpcmVjdGlvbiBvZiByZXN1bHRzIHJldHVybmVkLCBlaXRoZXIg4oCcYXNj4oCdIG9yIOKAnGRlc2PigJ0uIERlZmF1bHRzIHRvIOKAnGRlc2PigJ0uXG4gIC8vIHNpemUgKG9wdGlvbmFsKSBOdW1iZXIgb2Ygcm93cyByZXR1cm5lZCBieSBzZWFyY2guIERlZmF1bHRzIHRvIDEwXG4gIGdldExvZ3Mob3B0aW9ucyA9IHt9KSB7XG4gICAgaWYgKCF0aGlzLmFkYXB0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsICdMb2dnZXIgYWRhcHRlciBpcyBub3QgYXZhaWxhYmxlJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGhpcy5hZGFwdGVyLnF1ZXJ5ICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlBVU0hfTUlTQ09ORklHVVJFRCxcbiAgICAgICAgJ1F1ZXJ5aW5nIGxvZ3MgaXMgbm90IHN1cHBvcnRlZCB3aXRoIHRoaXMgYWRhcHRlcidcbiAgICAgICk7XG4gICAgfVxuICAgIG9wdGlvbnMgPSBMb2dnZXJDb250cm9sbGVyLnBhcnNlT3B0aW9ucyhvcHRpb25zKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnF1ZXJ5KG9wdGlvbnMpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTG9nZ2VyQWRhcHRlcjtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBMb2dnZXJDb250cm9sbGVyO1xuIl19