const express = require('express')
const app = express()
const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.STRIPE_ACCESS_TOKEN);


//middleware
app.use(cors())
app.use(express.json())


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    // bearer token
    const token = authorization.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res
                .status(401)
                .send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
    })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zzcfrzy.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const serviceCollection = client.db('maria-parlour').collection('services')
        const reviewCollection = client.db('maria-parlour').collection('review')
        const userCollection = client.db('maria-parlour').collection('users')
        const paymentCollection = client.db('maria-parlour').collection('payment')
        const userInfoCollection = client.db('maria-parlour').collection('userInfo')


        //generate jwt token
        app.post('/jwt', (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1d',
            })

            res.send({ token })
        })


        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        //save user to db
        app.put('/save-user', async (req, res) => {
            const user = req.body;
            const query = { email: user?.email }
            const options = { upsert: true }
            const updatedDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(query, updatedDoc, options)
            res.send(result)
        })

        //save user related info for project
        app.post('/save-user-info', async (req, res) => {
            const info = req.body;
            console.log(info)
            const result = await userInfoCollection.insertOne(info)
            res.send(result)
        })

        //get all services
        app.get('/services', async (req, res) => {
            const result = await serviceCollection.find().toArray()
            res.send(result)
        })

        //get one services 

        app.get('/services/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await serviceCollection.findOne(query)
            res.send(result)
        })

        //post one services
        app.post('/services', verifyJWT, verifyAdmin, async (req, res) => {
            const service = req.body;
            const result = await serviceCollection.insertOne(service)
            res.send(result)

        })

        //update service
        app.put('/services/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const updatedService = req.body;
            console.log(id,updatedService)
            const options = { upsert: true }
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: updatedService
            }
            const result = await serviceCollection.updateOne(filter, updatedDoc,options)
            console.log(result);
            res.send(result)
        })

        //update service status in paymentcollectiion
        app.put('/payments/:id', verifyJWT,verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            console.log(id, status)
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: status
                }
            }
            const result = await paymentCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        //delete one service
        app.delete('/services/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) }
            const result = await serviceCollection.deleteOne(filter)
            res.send(result)
        })


        //get all review
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        //post reviews
        app.post('/reviews', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review)
            res.send(result)
        })


        //get payments
        app.get('/payments', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await paymentCollection.find().toArray()
            res.send(result)
        })

        app.get('/payments/user', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await paymentCollection.find(query).toArray()
            res.send(result)
        })

        //make admin
        app.patch('/users/make-admin',verifyJWT, async (req, res) => {
            const email = req.query.email
            console.log(email)
            const filter = { email: email }


            const result1 = await userCollection.findOne(filter)

            const updateDoc = {
                $set: {
                    role: `admin`
                },
            };
            const result2 = await userCollection.updateOne(filter, updateDoc)
            // console.log(result2)
            // // const result = await userCollection.updateOne(body)
            res.send({ result1, result2 })
        })

        //get user role

        app.get('/users/isAdmin', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const result = await userCollection.findOne(query)
            if (result?.role === 'admin') {
                return res.send({ admin: true })
            }
            else {
                res.send({ admin: false })
            }
        })

        //payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });

        //save payment info to database
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment)
            res.send(result)

        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('maria is sitting')
})

app.listen(port, () => {
    console.log(`Maria is sitting on port ${port}`);
})