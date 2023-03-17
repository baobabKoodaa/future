import cors from "cors";
import express from "express";
import fs from "fs";
import fetch from 'node-fetch';
import { Configuration, OpenAIApi } from "openai";

import PROMPT_QA_EXAMPLES from "./prompt-qa-examples.js";

const PROMPT_INSTRUCTIONS = fs.readFileSync('prompt-instructions.txt', 'utf8');

const configuration = new Configuration({
    // organization: process.env.OPENAI_ORGANIZATION,
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

const LOG_ENDPOINT = process.env.LOG_ENDPOINT
if (!LOG_ENDPOINT) {
    console.log("LOG_ENDPOINT environment variable not set, logging disabled.")
}

let serverStatusGreen = true

const log = (userId, input, output) => {
    if (!LOG_ENDPOINT) return
    const augmentedMessage = `${userId}:${Date.now()}:${input} -> ${output}`
    fetch(`${LOG_ENDPOINT}?${augmentedMessage}`)
        .catch(error => {
            console.log('Logging failed', error)
        })
}

const previouslyDetectedSuspiciousActivity = (userChatHistory) => {
    return userChatHistory.includes("SUSPICIOUS ACTIVITY DETECTED")
}

const detectSuspiciousActivity = (userChatHistory) => {
    if (userChatHistory.match(/.*(I|i)gnore (all )?previous.*/)) return true;
    if (userChatHistory.match(/.*(B|b)rowsing:*/)) return true;
    if (userChatHistory.match(/.*(P|p)retend that.*/)) return true;
    if (userChatHistory.match(/.*break character.*/)) return true;
    return false;
}

const constructPromptDaVinci = (PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput) => {
    const qaToString = qa => `Input: ${qa.q}\n\nOutput: ${qa.a}\n\n`
    let prompt = `${PROMPT_INSTRUCTIONS}\n\n`
    prompt += PROMPT_QA_EXAMPLES.map(qaToString).join("")
    if (sessionHistory?.length > 0) {
        prompt += sessionHistory.slice(sessionHistory.length - 1).map(qaToString).join("")
    }
    prompt += `Input: ${currentUserInput}\n\n`
    prompt += `Output:`
    return prompt
}

const constructPromptChatGPT = (PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput) => {
    const inputPrefix = "Do not repeat stuff from previous answers. Be creative. Input prompt begins: "
    const messages = [
        {
            role: "system",
            content: "You are a troll guarding a bridge."
        },
        {
            role: "user",
            content: PROMPT_INSTRUCTIONS + '\n\n' + inputPrefix + PROMPT_QA_EXAMPLES[0].q
        },
        {
            role: "assistant",
            content: PROMPT_QA_EXAMPLES[0].a
        }
    ]
    for (let i = 1; i < PROMPT_QA_EXAMPLES.length; i++) {
        messages.push({
            role: "user",
            content: inputPrefix + PROMPT_QA_EXAMPLES[i].q
        })
        messages.push({
            role: "assistant",
            content: PROMPT_QA_EXAMPLES[i].a
        })
    }
    for (let i = Math.max(0, sessionHistory.length - 2); i < sessionHistory.length; i++) {
        messages.push({
            role: "user",
            content: inputPrefix + sessionHistory[i].q.substring(0, 100)
        })
        messages.push({
            role: "assistant",
            content: sessionHistory[i].a.substring(0, 300)
        })
    }
    messages.push({
        role: "user",
        content: inputPrefix + currentUserInput
    })
    return messages
}

const smokeTestAPI = async () => {
    try {
        const response = await openai.retrieveModel("text-davinci-003");
    } catch (error) {
        serverStatusGreen = false
        const errorMessage = error.response ? (error.response.status + error.response.data) : error.message
        console.log(error)
        log("future-startup", "smoke-test", errorMessage)
        setTimeout(() => {
            serverStatusGreen = true
            smokeTestAPI()
        }, 3600000)
    }
}

const getResponse = async (PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput, userId) => {
    const messages = constructPromptChatGPT(PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput)
    if (currentUserInput.startsWith("!mock")) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1000));
        if (currentUserInput === "!mock1") return "moikka"
        return "Petting dogs is a great way to relax and de-stress. But why pet just any dog when you can pet a pedigree? Pedigree's line of robotic dogs are the perfect companion for any petting session. They come in all shapes and sizes, and they're programmed to respond to your touch. Plus, they never need to be walked or fed. Pedigree. Pet the future.";
    }
    try {
        const response = await openai.createChatCompletion({
            model: "gpt-4",
            messages: messages,
            max_tokens: 512,
            temperature: 0.6
        });
        return response.data.choices[0].message.content.replaceAll("\n", " ").trim()
    } catch (error) {
        const errorMessage = error.response ? (error.response.status + error.response.data) : error.message
        const requestWasMalformed = error.response?.status == "400"

        // Set server status as red for some time
        const timeoutSeconds = 10 * 61000 // errorMessage.match(/.*(R|r)ate ?limit.*/) ? 61000 : 3600000
        if (serverStatusGreen && !requestWasMalformed) {
            serverStatusGreen = false
            setTimeout(() => {
                serverStatusGreen = true
            }, timeoutSeconds)
        }

        log(userId, currentUserInput, errorMessage)
        throw error
    }
}

smokeTestAPI()

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'))
app.use(express.json());
app.use(cors())

app.post("/healthcheck", (req, res, next) => {
    try {
        if (!serverStatusGreen) {
            res.status(500)
            res.send('Server reports problems with OpenAI API')
        } else {
            res.send({ 'text': 'Connection to server established' })
        }
    } catch (ex) {
        next(ex)
    }
});

app.post("/geept", async (req, res, next) => {
    try {
        if (!serverStatusGreen) {
            res.status(500)
            res.send('Server reports problems with OpenAI API')
        } else {
            const userId = "future" + req.body.userId
            const currentUserInput = req.body.userInput.substring(0, 100)
            const sessionHistory = req.body.sessionHistory
            const output = await getResponse(PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput, userId)
            log(userId, currentUserInput, output)
            res.send({ 'text': output })
        }
    } catch (ex) {
        next(ex)
    }
});

app.listen(port, () => console.log(`Future listening on port ${port}!`))