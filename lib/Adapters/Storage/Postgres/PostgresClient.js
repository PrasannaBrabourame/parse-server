"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createClient = createClient;

const parser = require('./PostgresConfigParser');

function createClient(uri, databaseOptions) {
  let dbOptions = {};
  databaseOptions = databaseOptions || {};

  if (uri) {
    dbOptions = parser.getDatabaseOptionsFromURI(uri);
  }

  for (const key in databaseOptions) {
    dbOptions[key] = databaseOptions[key];
  }

  const initOptions = dbOptions.initOptions || {};
  initOptions.noWarnings = process && process.env.TESTING;

  const pgp = require('pg-promise')(initOptions);

  const client = pgp(dbOptions);

  if (process.env.PARSE_SERVER_LOG_LEVEL === 'debug') {
    const monitor = require('pg-monitor');

    if (monitor.isAttached()) {
      monitor.detach();
    }

    monitor.attach(initOptions);
  }

  if (dbOptions.pgOptions) {
    for (const key in dbOptions.pgOptions) {
      pgp.pg.defaults[key] = dbOptions.pgOptions[key];
    }
  }

  return {
    client,
    pgp
  };
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzQ2xpZW50LmpzIl0sIm5hbWVzIjpbInBhcnNlciIsInJlcXVpcmUiLCJjcmVhdGVDbGllbnQiLCJ1cmkiLCJkYXRhYmFzZU9wdGlvbnMiLCJkYk9wdGlvbnMiLCJnZXREYXRhYmFzZU9wdGlvbnNGcm9tVVJJIiwia2V5IiwiaW5pdE9wdGlvbnMiLCJub1dhcm5pbmdzIiwicHJvY2VzcyIsImVudiIsIlRFU1RJTkciLCJwZ3AiLCJjbGllbnQiLCJQQVJTRV9TRVJWRVJfTE9HX0xFVkVMIiwibW9uaXRvciIsImlzQXR0YWNoZWQiLCJkZXRhY2giLCJhdHRhY2giLCJwZ09wdGlvbnMiLCJwZyIsImRlZmF1bHRzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUEsTUFBTUEsTUFBTSxHQUFHQyxPQUFPLENBQUMsd0JBQUQsQ0FBdEI7O0FBRU8sU0FBU0MsWUFBVCxDQUFzQkMsR0FBdEIsRUFBMkJDLGVBQTNCLEVBQTRDO0FBQ2pELE1BQUlDLFNBQVMsR0FBRyxFQUFoQjtBQUNBRCxFQUFBQSxlQUFlLEdBQUdBLGVBQWUsSUFBSSxFQUFyQzs7QUFFQSxNQUFJRCxHQUFKLEVBQVM7QUFDUEUsSUFBQUEsU0FBUyxHQUFHTCxNQUFNLENBQUNNLHlCQUFQLENBQWlDSCxHQUFqQyxDQUFaO0FBQ0Q7O0FBRUQsT0FBSyxNQUFNSSxHQUFYLElBQWtCSCxlQUFsQixFQUFtQztBQUNqQ0MsSUFBQUEsU0FBUyxDQUFDRSxHQUFELENBQVQsR0FBaUJILGVBQWUsQ0FBQ0csR0FBRCxDQUFoQztBQUNEOztBQUVELFFBQU1DLFdBQVcsR0FBR0gsU0FBUyxDQUFDRyxXQUFWLElBQXlCLEVBQTdDO0FBQ0FBLEVBQUFBLFdBQVcsQ0FBQ0MsVUFBWixHQUF5QkMsT0FBTyxJQUFJQSxPQUFPLENBQUNDLEdBQVIsQ0FBWUMsT0FBaEQ7O0FBRUEsUUFBTUMsR0FBRyxHQUFHWixPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCTyxXQUF0QixDQUFaOztBQUNBLFFBQU1NLE1BQU0sR0FBR0QsR0FBRyxDQUFDUixTQUFELENBQWxCOztBQUVBLE1BQUlLLE9BQU8sQ0FBQ0MsR0FBUixDQUFZSSxzQkFBWixLQUF1QyxPQUEzQyxFQUFvRDtBQUNsRCxVQUFNQyxPQUFPLEdBQUdmLE9BQU8sQ0FBQyxZQUFELENBQXZCOztBQUNBLFFBQUllLE9BQU8sQ0FBQ0MsVUFBUixFQUFKLEVBQTBCO0FBQ3hCRCxNQUFBQSxPQUFPLENBQUNFLE1BQVI7QUFDRDs7QUFDREYsSUFBQUEsT0FBTyxDQUFDRyxNQUFSLENBQWVYLFdBQWY7QUFDRDs7QUFFRCxNQUFJSCxTQUFTLENBQUNlLFNBQWQsRUFBeUI7QUFDdkIsU0FBSyxNQUFNYixHQUFYLElBQWtCRixTQUFTLENBQUNlLFNBQTVCLEVBQXVDO0FBQ3JDUCxNQUFBQSxHQUFHLENBQUNRLEVBQUosQ0FBT0MsUUFBUCxDQUFnQmYsR0FBaEIsSUFBdUJGLFNBQVMsQ0FBQ2UsU0FBVixDQUFvQmIsR0FBcEIsQ0FBdkI7QUFDRDtBQUNGOztBQUVELFNBQU87QUFBRU8sSUFBQUEsTUFBRjtBQUFVRCxJQUFBQTtBQUFWLEdBQVA7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IHBhcnNlciA9IHJlcXVpcmUoJy4vUG9zdGdyZXNDb25maWdQYXJzZXInKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNsaWVudCh1cmksIGRhdGFiYXNlT3B0aW9ucykge1xuICBsZXQgZGJPcHRpb25zID0ge307XG4gIGRhdGFiYXNlT3B0aW9ucyA9IGRhdGFiYXNlT3B0aW9ucyB8fCB7fTtcblxuICBpZiAodXJpKSB7XG4gICAgZGJPcHRpb25zID0gcGFyc2VyLmdldERhdGFiYXNlT3B0aW9uc0Zyb21VUkkodXJpKTtcbiAgfVxuXG4gIGZvciAoY29uc3Qga2V5IGluIGRhdGFiYXNlT3B0aW9ucykge1xuICAgIGRiT3B0aW9uc1trZXldID0gZGF0YWJhc2VPcHRpb25zW2tleV07XG4gIH1cblxuICBjb25zdCBpbml0T3B0aW9ucyA9IGRiT3B0aW9ucy5pbml0T3B0aW9ucyB8fCB7fTtcbiAgaW5pdE9wdGlvbnMubm9XYXJuaW5ncyA9IHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORztcblxuICBjb25zdCBwZ3AgPSByZXF1aXJlKCdwZy1wcm9taXNlJykoaW5pdE9wdGlvbnMpO1xuICBjb25zdCBjbGllbnQgPSBwZ3AoZGJPcHRpb25zKTtcblxuICBpZiAocHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0xPR19MRVZFTCA9PT0gJ2RlYnVnJykge1xuICAgIGNvbnN0IG1vbml0b3IgPSByZXF1aXJlKCdwZy1tb25pdG9yJyk7XG4gICAgaWYgKG1vbml0b3IuaXNBdHRhY2hlZCgpKSB7XG4gICAgICBtb25pdG9yLmRldGFjaCgpO1xuICAgIH1cbiAgICBtb25pdG9yLmF0dGFjaChpbml0T3B0aW9ucyk7XG4gIH1cblxuICBpZiAoZGJPcHRpb25zLnBnT3B0aW9ucykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIGRiT3B0aW9ucy5wZ09wdGlvbnMpIHtcbiAgICAgIHBncC5wZy5kZWZhdWx0c1trZXldID0gZGJPcHRpb25zLnBnT3B0aW9uc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGNsaWVudCwgcGdwIH07XG59XG4iXX0=