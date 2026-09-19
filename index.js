require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const app = express();


// ===============================
// Middleware
// ===============================

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));


// ===============================
// Firebase Admin
// ===============================

const firebaseKey = process.env.FIREBASE_SERVICE_KEY;

if (!firebaseKey) {
    throw new Error('FIREBASE_SERVICE_KEY is missing');
}

const decoded = Buffer.from(firebaseKey, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);

if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}


// ===============================
// Firebase Token Verification
// ===============================

const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({
            message: 'unauthorized access'
        });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).send({
            message: 'unauthorized access'
        });
    }

    try {
        const userInfo = await getAuth().verifyIdToken(token);

        console.log('Token verified:', userInfo.email);

        req.user = userInfo;

        next();

    } catch (error) {
        console.log('Firebase Token Error:', error.message);

        return res.status(401).send({
            message: 'unauthorized access'
        });
    }
};


// ===============================
// MongoDB
// ===============================

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error('MONGODB_URI is missing');
}

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

let db;
let productsCollection;
let bidsCollection;
let usersCollection;

let dbPromise;


// Connect to MongoDB only when needed
const connectDB = async () => {

    if (db) {
        return db;
    }

    if (!dbPromise) {

        dbPromise = client.connect()
            .then(() => {

                db = client.db('smart_db');

                productsCollection = db.collection('products');
                bidsCollection = db.collection('bids');
                usersCollection = db.collection('users');

                console.log(
                    'Pinged your deployment. You successfully connected to MongoDB!'
                );

                return db;
            })
            .catch((error) => {

                dbPromise = null;

                console.error('MongoDB connection error:', error);

                throw error;
            });
    }

    return dbPromise;
};


// ===============================
// Root Route
// ===============================

app.get('/', (req, res) => {

    res.send('smart deals server is running');

});


// ===============================
// Users
// ===============================

app.post('/users', async (req, res) => {

    try {

        await connectDB();

        const newUser = req.body;
        const email = req.body.email;

        const query = {
            email: email
        };

        const existingUser = await usersCollection.findOne(query);

        if (existingUser) {

            return res.send({
                message: 'user already exist'
            });
        }

        const result = await usersCollection.insertOne(newUser);

        res.send(result);

    } catch (error) {

        console.error('POST /users error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Get All Products
// ===============================

app.get('/products', async (req, res) => {

    try {

        await connectDB();

        const email = req.query.email;

        const query = {};

        if (email) {
            query.email = email;
        }

        const result = await productsCollection
            .find(query)
            .toArray();

        res.send(result);

    } catch (error) {

        console.error('GET /products error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Latest Products
// ===============================

app.get('/latest-products', async (req, res) => {

    try {

        await connectDB();

        const result = await productsCollection
            .find()
            .sort({
                created_at: -1
            })
            .limit(6)
            .toArray();

        res.send(result);

    } catch (error) {

        console.error('GET /latest-products error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Get Single Product
// ===============================

app.get('/products/:id', async (req, res) => {

    try {

        await connectDB();

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {

            return res.status(400).send({
                message: 'Invalid product id'
            });
        }

        const query = {
            _id: new ObjectId(id)
        };

        const result = await productsCollection.findOne(query);

        if (!result) {

            return res.status(404).send({
                message: 'Product not found'
            });
        }

        res.send(result);

    } catch (error) {

        console.error('GET /products/:id error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Add Product
// Firebase Authentication Required
// ===============================

app.post(
    '/products',
    verifyFirebaseToken,
    async (req, res) => {

        try {

            await connectDB();

            console.log('Authenticated user:', req.user.email);

            const newProduct = req.body;

            const result = await productsCollection.insertOne(
                newProduct
            );

            res.send(result);

        } catch (error) {

            console.error('POST /products error:', error);

            res.status(500).send({
                message: 'Internal server error'
            });
        }

    }
);


// ===============================
// Update Product
// ===============================

app.patch('/products/:id', async (req, res) => {

    try {

        await connectDB();

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {

            return res.status(400).send({
                message: 'Invalid product id'
            });
        }

        const updatedProduct = req.body;

        const query = {
            _id: new ObjectId(id)
        };

        const update = {
            $set: {
                name: updatedProduct.name,
                price: updatedProduct.price
            }
        };

        const result = await productsCollection.updateOne(
            query,
            update
        );

        res.send(result);

    } catch (error) {

        console.error('PATCH /products/:id error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Delete Product
// ===============================

app.delete('/products/:id', async (req, res) => {

    try {

        await connectDB();

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {

            return res.status(400).send({
                message: 'Invalid product id'
            });
        }

        const query = {
            _id: new ObjectId(id)
        };

        const result = await productsCollection.deleteOne(query);

        res.send(result);

    } catch (error) {

        console.error('DELETE /products/:id error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Get Bids
// Firebase Authentication Required
// ===============================

app.get(
    '/bids',
    verifyFirebaseToken,
    async (req, res) => {

        try {

            await connectDB();

            const email = req.query.email;

            const query = {};

            if (email) {

                if (email !== req.user.email) {

                    return res.status(403).send({
                        message: 'forbidden access'
                    });
                }

                query.buyer_email = email;
            }

            const result = await bidsCollection
                .find(query)
                .toArray();

            res.send(result);

        } catch (error) {

            console.error('GET /bids error:', error);

            res.status(500).send({
                message: 'Internal server error'
            });
        }

    }
);


// ===============================
// Get Bids for Specific Product
// ===============================

app.get('/products/bids/:productId', async (req, res) => {

    try {

        await connectDB();

        const productId = req.params.productId;

        const query = {
            productId: productId
        };

        const result = await bidsCollection
            .find(query)
            .sort({
                bid_price: -1
            })
            .toArray();

        res.send(result);

    } catch (error) {

        console.error(
            'GET /products/bids/:productId error:',
            error
        );

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Add Bid
// ===============================

app.post('/bids', async (req, res) => {

    try {

        await connectDB();

        const newBid = req.body;

        const result = await bidsCollection.insertOne(
            newBid
        );

        res.send(result);

    } catch (error) {

        console.error('POST /bids error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Delete Bid
// ===============================

app.delete('/bids/:id', async (req, res) => {

    try {

        await connectDB();

        const id = req.params.id;

        if (!ObjectId.isValid(id)) {

            return res.status(400).send({
                message: 'Invalid bid id'
            });
        }

        const query = {
            _id: new ObjectId(id)
        };

        const result = await bidsCollection.deleteOne(
            query
        );

        res.send(result);

    } catch (error) {

        console.error('DELETE /bids/:id error:', error);

        res.status(500).send({
            message: 'Internal server error'
        });
    }

});


// ===============================
// Vercel Export
// ===============================

module.exports = app;