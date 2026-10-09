const { MongoClient } = require('mongodb');
const config = require('../config');

// In-Memory Collection implementation for robust fallback
class InMemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = [];
    this._idCounter = 1;
  }

  async insertOne(doc) {
    const record = { ...doc, _id: doc._id || `mem_${this._idCounter++}` };
    this.docs.push(record);
    // Keep max 5000 records in memory for telemetry
    if (this.name === 'resource_telemetry' && this.docs.length > 5000) {
      this.docs.splice(0, 1000);
    }
    return { insertedId: record._id, acknowledged: true };
  }

  async insertMany(docs) {
    const insertedIds = {};
    docs.forEach(doc => {
      const record = { ...doc, _id: doc._id || `mem_${this._idCounter++}` };
      this.docs.push(record);
      insertedIds[record._id] = record._id;
    });
    return { insertedCount: docs.length, insertedIds, acknowledged: true };
  }

  _matchesQuery(doc, query = {}) {
    for (const [key, value] of Object.entries(query)) {
      if (key === '$or' && Array.isArray(value)) {
        const matchesAny = value.some(subQ => this._matchesQuery(doc, subQ));
        if (!matchesAny) return false;
        continue;
      }
      if (value && typeof value === 'object') {
        if ('$gt' in value && !(doc[key] > value.$gt)) return false;
        if ('$gte' in value && !(doc[key] >= value.$gte)) return false;
        if ('$lt' in value && !(doc[key] < value.$lt)) return false;
        if ('$lte' in value && !(doc[key] <= value.$lte)) return false;
        if ('$in' in value && !value.$in.includes(doc[key])) return false;
      } else {
        if (doc[key] !== value) return false;
      }
    }
    return true;
  }

  find(query = {}) {
    let result = this.docs.filter(d => this._matchesQuery(d, query));

    const cursor = {
      sort: (sortObj = {}) => {
        const [sortKey, sortDir] = Object.entries(sortObj)[0] || [];
        if (sortKey) {
          result.sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];
            if (valA < valB) return sortDir === -1 ? 1 : -1;
            if (valA > valB) return sortDir === -1 ? -1 : 1;
            return 0;
          });
        }
        return cursor;
      },
      limit: (count) => {
        result = result.slice(0, count);
        return cursor;
      },
      toArray: async () => [...result]
    };

    return cursor;
  }

  async findOne(query = {}) {
    return this.docs.find(d => this._matchesQuery(d, query)) || null;
  }

  async updateOne(query = {}, update = {}) {
    const doc = this.docs.find(d => this._matchesQuery(d, query));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };

    if (update.$set) {
      Object.assign(doc, update.$set);
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + v;
      }
    }
    return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
  }

  async updateMany(query = {}, update = {}) {
    const matchedDocs = this.docs.filter(d => this._matchesQuery(d, query));
    for (const doc of matchedDocs) {
      if (update.$set) {
        Object.assign(doc, update.$set);
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          doc[k] = (doc[k] || 0) + v;
        }
      }
    }
    return { matchedCount: matchedDocs.length, modifiedCount: matchedDocs.length, acknowledged: true };
  }

  async countDocuments(query = {}) {
    return this.docs.filter(d => this._matchesQuery(d, query)).length;
  }

  async createIndex() {
    return 'in_memory_index_ok';
  }

  async deleteMany(query = {}) {
    const initialLen = this.docs.length;
    this.docs = this.docs.filter(d => !this._matchesQuery(d, query));
    return { deletedCount: initialLen - this.docs.length };
  }
}

class InMemoryDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new InMemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

let clientInstance = null;
let dbInstance = null;
let isConnectedToRealMongo = false;
let connectionStatusMessage = 'Initializing...';

async function connectDb(customUri = null) {
  const uriToUse = customUri || config.mongoUri;

  if (uriToUse && uriToUse.trim().length > 0) {
    try {
      console.log(`[MongoDB] Attempting connection to: ${uriToUse.replace(/:([^:@]+)@/, ':****@')}`);
      const client = new MongoClient(uriToUse, {
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000
      });
      await client.connect();
      clientInstance = client;
      dbInstance = client.db(config.dbName);
      isConnectedToRealMongo = true;
      connectionStatusMessage = `Connected to MongoDB (${client.s.options.hosts?.[0]?.host || 'Remote Cluster'})`;
      console.log(`[MongoDB] ✓ Successfully connected to MongoDB database '${config.dbName}'`);

      // Ensure indexes
      await dbInstance.collection('resource_telemetry').createIndex({ hospitalId: 1, timestamp: -1 });
      await dbInstance.collection('hospitals').createIndex({ id: 1 }, { unique: true });
      await dbInstance.collection('transfer_logs').createIndex({ timestamp: -1 });

      return dbInstance;
    } catch (err) {
      console.warn(`[MongoDB] Could not connect to real MongoDB (${err.message}). Falling back to In-Memory MongoDB Store.`);
    }
  }

  // Fallback to In-Memory Database
  console.log('[MongoDB] Using Embedded In-Memory MongoDB Store (Zero configuration needed).');
  dbInstance = new InMemoryDb();
  isConnectedToRealMongo = false;
  connectionStatusMessage = 'Embedded In-Memory MongoDB Store (Ready for Live Stream)';
  return dbInstance;
}

function getDb() {
  if (!dbInstance) {
    dbInstance = new InMemoryDb();
    connectionStatusMessage = 'Embedded In-Memory MongoDB Store';
  }
  return dbInstance;
}

function getDbStatus() {
  return {
    isRealMongo: isConnectedToRealMongo,
    statusText: connectionStatusMessage,
    configuredUri: config.mongoUri ? config.mongoUri.replace(/:([^:@]+)@/, ':****@') : 'Not Set (Using Embedded Store)',
    dbName: config.dbName
  };
}

module.exports = {
  connectDb,
  getDb,
  getDbStatus
};
