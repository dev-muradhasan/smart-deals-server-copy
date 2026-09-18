require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;


const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./smartdeals-firebase-admin-sdk-key.json");
initializeApp({
    credential: cert(serviceAccount)
});


app.use(cors());
app.use(express.json());
app.use(morgan('dev'))

const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({
            message: "unauthorized access"
        });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).send({
            message: "unauthorized access"
        });
    }
    try {
        const userInfo = await getAuth().verifyIdToken(token);
        console.log("Token verified:", userInfo.email);
        req.user = userInfo;
        next();
    } catch (error) {
        console.log("Firebase Token Error:", error.message);
        return res.status(401).send({
            message: "unauthorized access"
        });
    }
};



const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('smart deals server is running')
})

async function run() {
    try {
        await client.connect();

        const db = client.db("smart_db");
        const productsCollection = db.collection('products');
        const bidsCollection = db.collection('bids');
        const usersCollection = db.collection('users')

        // jwt related api
        // app.post('/getToken', (req, res)=>{
        //     const loggedUser = req.body;
        //     const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {expiresIn: '1h'})
        //     res.send({token: token})
        // })

        app.post('/users', async (req, res) => {
            const newUser = req.body;
            const email = req.body.email;
            const query = { email: email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                res.send({ message: 'user already exist' })
            }
            else {
                const result = await usersCollection.insertOne(newUser);
                res.send(result)
            }
        })

        app.get('/products', async (req, res) => {
            // const projectFields = {title: 1}
            // const cursor = productsCollection.find().sort({ price_min: 1}).skip(1).limit(2).project(projectFields);
            const email = req.query.email;
            const query = {};
            if (email) {
                query.email = email;
            }
            const cursor = productsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })

        app.get('/latest-products', async (req, res) => {
            const cursor = productsCollection.find().sort({ created_at: -1 }).limit(6)
            const result = await cursor.toArray();
            res.send(result)
        })

        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        })

        app.post('/products', verifyFirebaseToken, async (req, res) => {
            console.log('headers in the post', req.headers);
            const newProduct = req.body;
            const result = await productsCollection.insertOne(newProduct);
            res.send(result)
        })

        app.patch('/products/:id', async (req, res) => {
            const id = req.params.id;
            const updatedProduct = req.body;
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    name: updatedProduct.name,
                    price: updatedProduct.price
                }
            }
            const result = await productsCollection.updateOne(query, update);
            res.send(result)
        })

        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsCollection.deleteOne(query)
            res.send(result)
        })


        // bids related api
        app.get('/bids', verifyFirebaseToken, async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.buyer_email = email;
                if (email !== req.user.email){
                    return res.status(403).send({message: 'forbidden access'})
                }
            }
            const result = await bidsCollection.find(query).toArray();
            res.send(result);
        });

        // app.get('/bids', verifyFirebaseToken, async (req, res) => {
        //     console.log('headers',req.headers);
        //     const email = req.query.email;
        //     const query = {};
        //     if (email) {
        //         query.buyer_email = email;
        //     }
        //     const cursor = bidsCollection.find(query);
        //     const result = await cursor.toArray();
        //     res.send(result)
        // })

        app.get('/products/bids/:productId', async (req, res) => {
            const productId = req.params.productId;
            const query = { productId: productId };
            const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
            const result = await cursor.toArray();
            res.send(result)
        })


        app.post('/bids', async (req, res) => {
            const newBid = req.body;
            const result = await bidsCollection.insertOne(newBid);
            res.send(result);
        })

        app.delete('/bids/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bidsCollection.deleteOne(query);
            res.send(result)
        })

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);

app.listen(port, (req, res) => {
    console.log(`smart deals server is running on port: ${port}`)
})

