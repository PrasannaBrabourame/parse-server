"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GridFSBucketAdapter = void 0;

var _mongodb = require("mongodb");

var _FilesAdapter = require("./FilesAdapter");

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 GridFSBucketAdapter
 Stores files in Mongo using GridFS
 Requires the database adapter to be based on mongoclient

 
 */
// -disable-next
const crypto = require('crypto');

class GridFSBucketAdapter extends _FilesAdapter.FilesAdapter {
  constructor(mongoDatabaseURI = _defaults.default.DefaultMongoURI, mongoOptions = {}, encryptionKey = undefined) {
    super();
    this._databaseURI = mongoDatabaseURI;
    this._algorithm = 'aes-256-gcm';
    this._encryptionKey = encryptionKey !== undefined ? crypto.createHash('sha256').update(String(encryptionKey)).digest('base64').substr(0, 32) : null;
    const defaultMongoOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
    this._mongoOptions = Object.assign(defaultMongoOptions, mongoOptions);
  }

  _connect() {
    if (!this._connectionPromise) {
      this._connectionPromise = _mongodb.MongoClient.connect(this._databaseURI, this._mongoOptions).then(client => {
        this._client = client;
        return client.db(client.s.options.dbName);
      });
    }

    return this._connectionPromise;
  }

  _getBucket() {
    return this._connect().then(database => new _mongodb.GridFSBucket(database));
  } // For a given config object, filename, and data, store a file
  // Returns a promise


  async createFile(filename, data, contentType, options = {}) {
    const bucket = await this._getBucket();
    const stream = await bucket.openUploadStream(filename, {
      metadata: options.metadata
    });

    if (this._encryptionKey !== null) {
      try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this._algorithm, this._encryptionKey, iv);
        const encryptedResult = Buffer.concat([cipher.update(data), cipher.final(), iv, cipher.getAuthTag()]);
        await stream.write(encryptedResult);
      } catch (err) {
        return new Promise((resolve, reject) => {
          return reject(err);
        });
      }
    } else {
      await stream.write(data);
    }

    stream.end();
    return new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  async deleteFile(filename) {
    const bucket = await this._getBucket();
    const documents = await bucket.find({
      filename
    }).toArray();

    if (documents.length === 0) {
      throw new Error('FileNotFound');
    }

    return Promise.all(documents.map(doc => {
      return bucket.delete(doc._id);
    }));
  }

  async getFileData(filename) {
    const bucket = await this._getBucket();
    const stream = bucket.openDownloadStreamByName(filename);
    stream.read();
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', data => {
        chunks.push(data);
      });
      stream.on('end', () => {
        const data = Buffer.concat(chunks);

        if (this._encryptionKey !== null) {
          try {
            const authTagLocation = data.length - 16;
            const ivLocation = data.length - 32;
            const authTag = data.slice(authTagLocation);
            const iv = data.slice(ivLocation, authTagLocation);
            const encrypted = data.slice(0, ivLocation);
            const decipher = crypto.createDecipheriv(this._algorithm, this._encryptionKey, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            return resolve(decrypted);
          } catch (err) {
            return reject(err);
          }
        }

        resolve(data);
      });
      stream.on('error', err => {
        reject(err);
      });
    });
  }

  async rotateEncryptionKey(options = {}) {
    var fileNames = [];
    var oldKeyFileAdapter = {};
    const bucket = await this._getBucket();

    if (options.oldKey !== undefined) {
      oldKeyFileAdapter = new GridFSBucketAdapter(this._databaseURI, this._mongoOptions, options.oldKey);
    } else {
      oldKeyFileAdapter = new GridFSBucketAdapter(this._databaseURI, this._mongoOptions);
    }

    if (options.fileNames !== undefined) {
      fileNames = options.fileNames;
    } else {
      const fileNamesIterator = await bucket.find().toArray();
      fileNamesIterator.forEach(file => {
        fileNames.push(file.filename);
      });
    }

    return new Promise(resolve => {
      var fileNamesNotRotated = fileNames;
      var fileNamesRotated = [];
      var fileNameTotal = fileNames.length;
      var fileNameIndex = 0;
      fileNames.forEach(fileName => {
        oldKeyFileAdapter.getFileData(fileName).then(plainTextData => {
          //Overwrite file with data encrypted with new key
          this.createFile(fileName, plainTextData).then(() => {
            fileNamesRotated.push(fileName);
            fileNamesNotRotated = fileNamesNotRotated.filter(function (value) {
              return value !== fileName;
            });
            fileNameIndex += 1;

            if (fileNameIndex == fileNameTotal) {
              resolve({
                rotated: fileNamesRotated,
                notRotated: fileNamesNotRotated
              });
            }
          }).catch(() => {
            fileNameIndex += 1;

            if (fileNameIndex == fileNameTotal) {
              resolve({
                rotated: fileNamesRotated,
                notRotated: fileNamesNotRotated
              });
            }
          });
        }).catch(() => {
          fileNameIndex += 1;

          if (fileNameIndex == fileNameTotal) {
            resolve({
              rotated: fileNamesRotated,
              notRotated: fileNamesNotRotated
            });
          }
        });
      });
    });
  }

  getFileLocation(config, filename) {
    return config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename);
  }

  async getMetadata(filename) {
    const bucket = await this._getBucket();
    const files = await bucket.find({
      filename
    }).toArray();

    if (files.length === 0) {
      return {};
    }

    const {
      metadata
    } = files[0];
    return {
      metadata
    };
  }

  async handleFileStream(filename, req, res, contentType) {
    const bucket = await this._getBucket();
    const files = await bucket.find({
      filename
    }).toArray();

    if (files.length === 0) {
      throw new Error('FileNotFound');
    }

    const parts = req.get('Range').replace(/bytes=/, '').split('-');
    const partialstart = parts[0];
    const partialend = parts[1];
    const start = parseInt(partialstart, 10);
    const end = partialend ? parseInt(partialend, 10) : files[0].length - 1;
    res.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + files[0].length,
      'Content-Type': contentType
    });
    const stream = bucket.openDownloadStreamByName(filename);
    stream.start(start);
    stream.on('data', chunk => {
      res.write(chunk);
    });
    stream.on('error', () => {
      res.sendStatus(404);
    });
    stream.on('end', () => {
      res.end();
    });
  }

  handleShutdown() {
    if (!this._client) {
      return Promise.resolve();
    }

    return this._client.close(false);
  }

  validateFilename(filename) {
    return (0, _FilesAdapter.validateFilename)(filename);
  }

}

exports.GridFSBucketAdapter = GridFSBucketAdapter;
var _default = GridFSBucketAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9GaWxlcy9HcmlkRlNCdWNrZXRBZGFwdGVyLmpzIl0sIm5hbWVzIjpbImNyeXB0byIsInJlcXVpcmUiLCJHcmlkRlNCdWNrZXRBZGFwdGVyIiwiRmlsZXNBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJtb25nb0RhdGFiYXNlVVJJIiwiZGVmYXVsdHMiLCJEZWZhdWx0TW9uZ29VUkkiLCJtb25nb09wdGlvbnMiLCJlbmNyeXB0aW9uS2V5IiwidW5kZWZpbmVkIiwiX2RhdGFiYXNlVVJJIiwiX2FsZ29yaXRobSIsIl9lbmNyeXB0aW9uS2V5IiwiY3JlYXRlSGFzaCIsInVwZGF0ZSIsIlN0cmluZyIsImRpZ2VzdCIsInN1YnN0ciIsImRlZmF1bHRNb25nb09wdGlvbnMiLCJ1c2VOZXdVcmxQYXJzZXIiLCJ1c2VVbmlmaWVkVG9wb2xvZ3kiLCJfbW9uZ29PcHRpb25zIiwiT2JqZWN0IiwiYXNzaWduIiwiX2Nvbm5lY3QiLCJfY29ubmVjdGlvblByb21pc2UiLCJNb25nb0NsaWVudCIsImNvbm5lY3QiLCJ0aGVuIiwiY2xpZW50IiwiX2NsaWVudCIsImRiIiwicyIsIm9wdGlvbnMiLCJkYk5hbWUiLCJfZ2V0QnVja2V0IiwiZGF0YWJhc2UiLCJHcmlkRlNCdWNrZXQiLCJjcmVhdGVGaWxlIiwiZmlsZW5hbWUiLCJkYXRhIiwiY29udGVudFR5cGUiLCJidWNrZXQiLCJzdHJlYW0iLCJvcGVuVXBsb2FkU3RyZWFtIiwibWV0YWRhdGEiLCJpdiIsInJhbmRvbUJ5dGVzIiwiY2lwaGVyIiwiY3JlYXRlQ2lwaGVyaXYiLCJlbmNyeXB0ZWRSZXN1bHQiLCJCdWZmZXIiLCJjb25jYXQiLCJmaW5hbCIsImdldEF1dGhUYWciLCJ3cml0ZSIsImVyciIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZW5kIiwib24iLCJkZWxldGVGaWxlIiwiZG9jdW1lbnRzIiwiZmluZCIsInRvQXJyYXkiLCJsZW5ndGgiLCJFcnJvciIsImFsbCIsIm1hcCIsImRvYyIsImRlbGV0ZSIsIl9pZCIsImdldEZpbGVEYXRhIiwib3BlbkRvd25sb2FkU3RyZWFtQnlOYW1lIiwicmVhZCIsImNodW5rcyIsInB1c2giLCJhdXRoVGFnTG9jYXRpb24iLCJpdkxvY2F0aW9uIiwiYXV0aFRhZyIsInNsaWNlIiwiZW5jcnlwdGVkIiwiZGVjaXBoZXIiLCJjcmVhdGVEZWNpcGhlcml2Iiwic2V0QXV0aFRhZyIsImRlY3J5cHRlZCIsInJvdGF0ZUVuY3J5cHRpb25LZXkiLCJmaWxlTmFtZXMiLCJvbGRLZXlGaWxlQWRhcHRlciIsIm9sZEtleSIsImZpbGVOYW1lc0l0ZXJhdG9yIiwiZm9yRWFjaCIsImZpbGUiLCJmaWxlTmFtZXNOb3RSb3RhdGVkIiwiZmlsZU5hbWVzUm90YXRlZCIsImZpbGVOYW1lVG90YWwiLCJmaWxlTmFtZUluZGV4IiwiZmlsZU5hbWUiLCJwbGFpblRleHREYXRhIiwiZmlsdGVyIiwidmFsdWUiLCJyb3RhdGVkIiwibm90Um90YXRlZCIsImNhdGNoIiwiZ2V0RmlsZUxvY2F0aW9uIiwiY29uZmlnIiwibW91bnQiLCJhcHBsaWNhdGlvbklkIiwiZW5jb2RlVVJJQ29tcG9uZW50IiwiZ2V0TWV0YWRhdGEiLCJmaWxlcyIsImhhbmRsZUZpbGVTdHJlYW0iLCJyZXEiLCJyZXMiLCJwYXJ0cyIsImdldCIsInJlcGxhY2UiLCJzcGxpdCIsInBhcnRpYWxzdGFydCIsInBhcnRpYWxlbmQiLCJzdGFydCIsInBhcnNlSW50Iiwid3JpdGVIZWFkIiwiY2h1bmsiLCJzZW5kU3RhdHVzIiwiaGFuZGxlU2h1dGRvd24iLCJjbG9zZSIsInZhbGlkYXRlRmlsZW5hbWUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFTQTs7QUFDQTs7QUFDQTs7OztBQVhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7QUFJQSxNQUFNQSxNQUFNLEdBQUdDLE9BQU8sQ0FBQyxRQUFELENBQXRCOztBQUVPLE1BQU1DLG1CQUFOLFNBQWtDQywwQkFBbEMsQ0FBK0M7QUFN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Q3pCVixNQUFBQSxHQUFHLENBQUMzRCxLQUFKLENBQVVxRSxLQUFWO0FBQ0QsS0FGRDtBQUdBakYsSUFBQUEsTUFBTSxDQUFDa0IsRUFBUCxDQUFVLE9BQVYsRUFBbUIsTUFBTTtBQUN2QnFELE1BQUFBLEdBQUcsQ0FBQ1csVUFBSixDQUFlLEdBQWY7QUFDRCxLQUZEO0FBR0FsRixJQUFBQSxNQUFNLENBQUNrQixFQUFQLENBQVUsS0FBVixFQUFpQixNQUFNO0FBQ3JCcUQsTUFBQUEsR0FBRyxDQUFDdEQsR0FBSjtBQUNELEtBRkQ7QUFHRDs7QUFFRGtFLEVBQUFBLGNBQWMsR0FBRztBQUNmLFFBQUksQ0FBQyxLQUFLaEcsT0FBVixFQUFtQjtBQUNqQixhQUFPMkIsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRDs7QUFDRCxXQUFPLEtBQUs1QixPQUFMLENBQWFpRyxLQUFiLENBQW1CLEtBQW5CLENBQVA7QUFDRDs7QUFFREMsRUFBQUEsZ0JBQWdCLENBQUN6RixRQUFELEVBQVc7QUFDekIsV0FBTyxvQ0FBaUJBLFFBQWpCLENBQVA7QUFDRDs7QUF2UG1EOzs7ZUEwUHZDdEMsbUIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiBHcmlkRlNCdWNrZXRBZGFwdGVyXG4gU3RvcmVzIGZpbGVzIGluIE1vbmdvIHVzaW5nIEdyaWRGU1xuIFJlcXVpcmVzIHRoZSBkYXRhYmFzZSBhZGFwdGVyIHRvIGJlIGJhc2VkIG9uIG1vbmdvY2xpZW50XG5cbiBAZmxvdyB3ZWFrXG4gKi9cblxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyBNb25nb0NsaWVudCwgR3JpZEZTQnVja2V0LCBEYiB9IGZyb20gJ21vbmdvZGInO1xuaW1wb3J0IHsgRmlsZXNBZGFwdGVyLCB2YWxpZGF0ZUZpbGVuYW1lIH0gZnJvbSAnLi9GaWxlc0FkYXB0ZXInO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uLy4uL2RlZmF1bHRzJztcbmNvbnN0IGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpO1xuXG5leHBvcnQgY2xhc3MgR3JpZEZTQnVja2V0QWRhcHRlciBleHRlbmRzIEZpbGVzQWRhcHRlciB7XG4gIF9kYXRhYmFzZVVSSTogc3RyaW5nO1xuICBfY29ubmVjdGlvblByb21pc2U6IFByb21pc2U8RGI+O1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9hbGdvcml0aG06IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBtb25nb0RhdGFiYXNlVVJJID0gZGVmYXVsdHMuRGVmYXVsdE1vbmdvVVJJLFxuICAgIG1vbmdvT3B0aW9ucyA9IHt9LFxuICAgIGVuY3J5cHRpb25LZXkgPSB1bmRlZmluZWRcbiAgKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLl9kYXRhYmFzZVVSSSA9IG1vbmdvRGF0YWJhc2VVUkk7XG4gICAgdGhpcy5fYWxnb3JpdGhtID0gJ2Flcy0yNTYtZ2NtJztcbiAgICB0aGlzLl9lbmNyeXB0aW9uS2V5ID1cbiAgICAgIGVuY3J5cHRpb25LZXkgIT09IHVuZGVmaW5lZFxuICAgICAgICA/IGNyeXB0by5jcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoU3RyaW5nKGVuY3J5cHRpb25LZXkpKS5kaWdlc3QoJ2Jhc2U2NCcpLnN1YnN0cigwLCAzMilcbiAgICAgICAgOiBudWxsO1xuICAgIGNvbnN0IGRlZmF1bHRNb25nb09wdGlvbnMgPSB7XG4gICAgICB1c2VOZXdVcmxQYXJzZXI6IHRydWUsXG4gICAgICB1c2VVbmlmaWVkVG9wb2xvZ3k6IHRydWUsXG4gICAgfTtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMgPSBPYmplY3QuYXNzaWduKGRlZmF1bHRNb25nb09wdGlvbnMsIG1vbmdvT3B0aW9ucyk7XG4gIH1cblxuICBfY29ubmVjdCgpIHtcbiAgICBpZiAoIXRoaXMuX2Nvbm5lY3Rpb25Qcm9taXNlKSB7XG4gICAgICB0aGlzLl9jb25uZWN0aW9uUHJvbWlzZSA9IE1vbmdvQ2xpZW50LmNvbm5lY3QodGhpcy5fZGF0YWJhc2VVUkksIHRoaXMuX21vbmdvT3B0aW9ucykudGhlbihcbiAgICAgICAgY2xpZW50ID0+IHtcbiAgICAgICAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgICAgICAgcmV0dXJuIGNsaWVudC5kYihjbGllbnQucy5vcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9jb25uZWN0aW9uUHJvbWlzZTtcbiAgfVxuXG4gIF9nZXRCdWNrZXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2Nvbm5lY3QoKS50aGVuKGRhdGFiYXNlID0+IG5ldyBHcmlkRlNCdWNrZXQoZGF0YWJhc2UpKTtcbiAgfVxuXG4gIC8vIEZvciBhIGdpdmVuIGNvbmZpZyBvYmplY3QsIGZpbGVuYW1lLCBhbmQgZGF0YSwgc3RvcmUgYSBmaWxlXG4gIC8vIFJldHVybnMgYSBwcm9taXNlXG4gIGFzeW5jIGNyZWF0ZUZpbGUoZmlsZW5hbWU6IHN0cmluZywgZGF0YSwgY29udGVudFR5cGUsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGJ1Y2tldCA9IGF3YWl0IHRoaXMuX2dldEJ1Y2tldCgpO1xuICAgIGNvbnN0IHN0cmVhbSA9IGF3YWl0IGJ1Y2tldC5vcGVuVXBsb2FkU3RyZWFtKGZpbGVuYW1lLCB7XG4gICAgICBtZXRhZGF0YTogb3B0aW9ucy5tZXRhZGF0YSxcbiAgICB9KTtcbiAgICBpZiAodGhpcy5fZW5jcnlwdGlvbktleSAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXYgPSBjcnlwdG8ucmFuZG9tQnl0ZXMoMTYpO1xuICAgICAgICBjb25zdCBjaXBoZXIgPSBjcnlwdG8uY3JlYXRlQ2lwaGVyaXYodGhpcy5fYWxnb3JpdGhtLCB0aGlzLl9lbmNyeXB0aW9uS2V5LCBpdik7XG4gICAgICAgIGNvbnN0IGVuY3J5cHRlZFJlc3VsdCA9IEJ1ZmZlci5jb25jYXQoW1xuICAgICAgICAgIGNpcGhlci51cGRhdGUoZGF0YSksXG4gICAgICAgICAgY2lwaGVyLmZpbmFsKCksXG4gICAgICAgICAgaXYsXG4gICAgICAgICAgY2lwaGVyLmdldEF1dGhUYWcoKSxcbiAgICAgICAgXSk7XG4gICAgICAgIGF3YWl0IHN0cmVhbS53cml0ZShlbmNyeXB0ZWRSZXN1bHQpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgc3RyZWFtLndyaXRlKGRhdGEpO1xuICAgIH1cbiAgICBzdHJlYW0uZW5kKCk7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHN0cmVhbS5vbignZmluaXNoJywgcmVzb2x2ZSk7XG4gICAgICBzdHJlYW0ub24oJ2Vycm9yJywgcmVqZWN0KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUZpbGUoZmlsZW5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGJ1Y2tldCA9IGF3YWl0IHRoaXMuX2dldEJ1Y2tldCgpO1xuICAgIGNvbnN0IGRvY3VtZW50cyA9IGF3YWl0IGJ1Y2tldC5maW5kKHsgZmlsZW5hbWUgfSkudG9BcnJheSgpO1xuICAgIGlmIChkb2N1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGVOb3RGb3VuZCcpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICBkb2N1bWVudHMubWFwKGRvYyA9PiB7XG4gICAgICAgIHJldHVybiBidWNrZXQuZGVsZXRlKGRvYy5faWQpO1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgZ2V0RmlsZURhdGEoZmlsZW5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGJ1Y2tldCA9IGF3YWl0IHRoaXMuX2dldEJ1Y2tldCgpO1xuICAgIGNvbnN0IHN0cmVhbSA9IGJ1Y2tldC5vcGVuRG93bmxvYWRTdHJlYW1CeU5hbWUoZmlsZW5hbWUpO1xuICAgIHN0cmVhbS5yZWFkKCk7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IGNodW5rcyA9IFtdO1xuICAgICAgc3RyZWFtLm9uKCdkYXRhJywgZGF0YSA9PiB7XG4gICAgICAgIGNodW5rcy5wdXNoKGRhdGEpO1xuICAgICAgfSk7XG4gICAgICBzdHJlYW0ub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgY29uc3QgZGF0YSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKTtcbiAgICAgICAgaWYgKHRoaXMuX2VuY3J5cHRpb25LZXkgIT09IG51bGwpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYXV0aFRhZ0xvY2F0aW9uID0gZGF0YS5sZW5ndGggLSAxNjtcbiAgICAgICAgICAgIGNvbnN0IGl2TG9jYXRpb24gPSBkYXRhLmxlbmd0aCAtIDMyO1xuICAgICAgICAgICAgY29uc3QgYXV0aFRhZyA9IGRhdGEuc2xpY2UoYXV0aFRhZ0xvY2F0aW9uKTtcbiAgICAgICAgICAgIGNvbnN0IGl2ID0gZGF0YS5zbGljZShpdkxvY2F0aW9uLCBhdXRoVGFnTG9jYXRpb24pO1xuICAgICAgICAgICAgY29uc3QgZW5jcnlwdGVkID0gZGF0YS5zbGljZSgwLCBpdkxvY2F0aW9uKTtcbiAgICAgICAgICAgIGNvbnN0IGRlY2lwaGVyID0gY3J5cHRvLmNyZWF0ZURlY2lwaGVyaXYodGhpcy5fYWxnb3JpdGhtLCB0aGlzLl9lbmNyeXB0aW9uS2V5LCBpdik7XG4gICAgICAgICAgICBkZWNpcGhlci5zZXRBdXRoVGFnKGF1dGhUYWcpO1xuICAgICAgICAgICAgY29uc3QgZGVjcnlwdGVkID0gQnVmZmVyLmNvbmNhdChbZGVjaXBoZXIudXBkYXRlKGVuY3J5cHRlZCksIGRlY2lwaGVyLmZpbmFsKCldKTtcbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRlY3J5cHRlZCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJlc29sdmUoZGF0YSk7XG4gICAgICB9KTtcbiAgICAgIHN0cmVhbS5vbignZXJyb3InLCBlcnIgPT4ge1xuICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcm90YXRlRW5jcnlwdGlvbktleShvcHRpb25zID0ge30pIHtcbiAgICB2YXIgZmlsZU5hbWVzID0gW107XG4gICAgdmFyIG9sZEtleUZpbGVBZGFwdGVyID0ge307XG4gICAgY29uc3QgYnVja2V0ID0gYXdhaXQgdGhpcy5fZ2V0QnVja2V0KCk7XG4gICAgaWYgKG9wdGlvbnMub2xkS2V5ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG9sZEtleUZpbGVBZGFwdGVyID0gbmV3IEdyaWRGU0J1Y2tldEFkYXB0ZXIoXG4gICAgICAgIHRoaXMuX2RhdGFiYXNlVVJJLFxuICAgICAgICB0aGlzLl9tb25nb09wdGlvbnMsXG4gICAgICAgIG9wdGlvbnMub2xkS2V5XG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBvbGRLZXlGaWxlQWRhcHRlciA9IG5ldyBHcmlkRlNCdWNrZXRBZGFwdGVyKHRoaXMuX2RhdGFiYXNlVVJJLCB0aGlzLl9tb25nb09wdGlvbnMpO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy5maWxlTmFtZXMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZU5hbWVzID0gb3B0aW9ucy5maWxlTmFtZXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGZpbGVOYW1lc0l0ZXJhdG9yID0gYXdhaXQgYnVja2V0LmZpbmQoKS50b0FycmF5KCk7XG4gICAgICBmaWxlTmFtZXNJdGVyYXRvci5mb3JFYWNoKGZpbGUgPT4ge1xuICAgICAgICBmaWxlTmFtZXMucHVzaChmaWxlLmZpbGVuYW1lKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICB2YXIgZmlsZU5hbWVzTm90Um90YXRlZCA9IGZpbGVOYW1lcztcbiAgICAgIHZhciBmaWxlTmFtZXNSb3RhdGVkID0gW107XG4gICAgICB2YXIgZmlsZU5hbWVUb3RhbCA9IGZpbGVOYW1lcy5sZW5ndGg7XG4gICAgICB2YXIgZmlsZU5hbWVJbmRleCA9IDA7XG4gICAgICBmaWxlTmFtZXMuZm9yRWFjaChmaWxlTmFtZSA9PiB7XG4gICAgICAgIG9sZEtleUZpbGVBZGFwdGVyXG4gICAgICAgICAgLmdldEZpbGVEYXRhKGZpbGVOYW1lKVxuICAgICAgICAgIC50aGVuKHBsYWluVGV4dERhdGEgPT4ge1xuICAgICAgICAgICAgLy9PdmVyd3JpdGUgZmlsZSB3aXRoIGRhdGEgZW5jcnlwdGVkIHdpdGggbmV3IGtleVxuICAgICAgICAgICAgdGhpcy5jcmVhdGVGaWxlKGZpbGVOYW1lLCBwbGFpblRleHREYXRhKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgZmlsZU5hbWVzUm90YXRlZC5wdXNoKGZpbGVOYW1lKTtcbiAgICAgICAgICAgICAgICBmaWxlTmFtZXNOb3RSb3RhdGVkID0gZmlsZU5hbWVzTm90Um90YXRlZC5maWx0ZXIoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgIT09IGZpbGVOYW1lO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGZpbGVOYW1lSW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZU5hbWVJbmRleCA9PSBmaWxlTmFtZVRvdGFsKSB7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlKHtcbiAgICAgICAgICAgICAgICAgICAgcm90YXRlZDogZmlsZU5hbWVzUm90YXRlZCxcbiAgICAgICAgICAgICAgICAgICAgbm90Um90YXRlZDogZmlsZU5hbWVzTm90Um90YXRlZCxcbiAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICBmaWxlTmFtZUluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGVOYW1lSW5kZXggPT0gZmlsZU5hbWVUb3RhbCkge1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICAgIHJvdGF0ZWQ6IGZpbGVOYW1lc1JvdGF0ZWQsXG4gICAgICAgICAgICAgICAgICAgIG5vdFJvdGF0ZWQ6IGZpbGVOYW1lc05vdFJvdGF0ZWQsXG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgIGZpbGVOYW1lSW5kZXggKz0gMTtcbiAgICAgICAgICAgIGlmIChmaWxlTmFtZUluZGV4ID09IGZpbGVOYW1lVG90YWwpIHtcbiAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgcm90YXRlZDogZmlsZU5hbWVzUm90YXRlZCxcbiAgICAgICAgICAgICAgICBub3RSb3RhdGVkOiBmaWxlTmFtZXNOb3RSb3RhdGVkLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0RmlsZUxvY2F0aW9uKGNvbmZpZywgZmlsZW5hbWUpIHtcbiAgICByZXR1cm4gY29uZmlnLm1vdW50ICsgJy9maWxlcy8nICsgY29uZmlnLmFwcGxpY2F0aW9uSWQgKyAnLycgKyBlbmNvZGVVUklDb21wb25lbnQoZmlsZW5hbWUpO1xuICB9XG5cbiAgYXN5bmMgZ2V0TWV0YWRhdGEoZmlsZW5hbWUpIHtcbiAgICBjb25zdCBidWNrZXQgPSBhd2FpdCB0aGlzLl9nZXRCdWNrZXQoKTtcbiAgICBjb25zdCBmaWxlcyA9IGF3YWl0IGJ1Y2tldC5maW5kKHsgZmlsZW5hbWUgfSkudG9BcnJheSgpO1xuICAgIGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gICAgY29uc3QgeyBtZXRhZGF0YSB9ID0gZmlsZXNbMF07XG4gICAgcmV0dXJuIHsgbWV0YWRhdGEgfTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUZpbGVTdHJlYW0oZmlsZW5hbWU6IHN0cmluZywgcmVxLCByZXMsIGNvbnRlbnRUeXBlKSB7XG4gICAgY29uc3QgYnVja2V0ID0gYXdhaXQgdGhpcy5fZ2V0QnVja2V0KCk7XG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBidWNrZXQuZmluZCh7IGZpbGVuYW1lIH0pLnRvQXJyYXkoKTtcbiAgICBpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpbGVOb3RGb3VuZCcpO1xuICAgIH1cbiAgICBjb25zdCBwYXJ0cyA9IHJlcVxuICAgICAgLmdldCgnUmFuZ2UnKVxuICAgICAgLnJlcGxhY2UoL2J5dGVzPS8sICcnKVxuICAgICAgLnNwbGl0KCctJyk7XG4gICAgY29uc3QgcGFydGlhbHN0YXJ0ID0gcGFydHNbMF07XG4gICAgY29uc3QgcGFydGlhbGVuZCA9IHBhcnRzWzFdO1xuXG4gICAgY29uc3Qgc3RhcnQgPSBwYXJzZUludChwYXJ0aWFsc3RhcnQsIDEwKTtcbiAgICBjb25zdCBlbmQgPSBwYXJ0aWFsZW5kID8gcGFyc2VJbnQocGFydGlhbGVuZCwgMTApIDogZmlsZXNbMF0ubGVuZ3RoIC0gMTtcblxuICAgIHJlcy53cml0ZUhlYWQoMjA2LCB7XG4gICAgICAnQWNjZXB0LVJhbmdlcyc6ICdieXRlcycsXG4gICAgICAnQ29udGVudC1MZW5ndGgnOiBlbmQgLSBzdGFydCArIDEsXG4gICAgICAnQ29udGVudC1SYW5nZSc6ICdieXRlcyAnICsgc3RhcnQgKyAnLScgKyBlbmQgKyAnLycgKyBmaWxlc1swXS5sZW5ndGgsXG4gICAgICAnQ29udGVudC1UeXBlJzogY29udGVudFR5cGUsXG4gICAgfSk7XG4gICAgY29uc3Qgc3RyZWFtID0gYnVja2V0Lm9wZW5Eb3dubG9hZFN0cmVhbUJ5TmFtZShmaWxlbmFtZSk7XG4gICAgc3RyZWFtLnN0YXJ0KHN0YXJ0KTtcbiAgICBzdHJlYW0ub24oJ2RhdGEnLCBjaHVuayA9PiB7XG4gICAgICByZXMud3JpdGUoY2h1bmspO1xuICAgIH0pO1xuICAgIHN0cmVhbS5vbignZXJyb3InLCAoKSA9PiB7XG4gICAgICByZXMuc2VuZFN0YXR1cyg0MDQpO1xuICAgIH0pO1xuICAgIHN0cmVhbS5vbignZW5kJywgKCkgPT4ge1xuICAgICAgcmVzLmVuZCgpO1xuICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5jbG9zZShmYWxzZSk7XG4gIH1cblxuICB2YWxpZGF0ZUZpbGVuYW1lKGZpbGVuYW1lKSB7XG4gICAgcmV0dXJuIHZhbGlkYXRlRmlsZW5hbWUoZmlsZW5hbWUpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IEdyaWRGU0J1Y2tldEFkYXB0ZXI7XG4iXX0=