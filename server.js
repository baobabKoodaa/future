import { Configuration, OpenAIApi } from "openai";
import express from "express";
import cors from "cors";
import fetch from 'node-fetch';
import fs from "fs";
import path from "path";

import PROMPT_QA_EXAMPLES from "./prompt-qa-examples.js";

const PROMPT_INSTRUCTIONS = fs.readFileSync('prompt-instructions.txt', 'utf8');

const configuration = new Configuration({
    organization: "org-XYMBE69y2nkcQv9ZnskdCdDT", // "Personal" organization - this value is same for everyone.
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

const LOG_ENDPOINT = process.env.LOG_ENDPOINT
if (!LOG_ENDPOINT) {
    console.log("LOG_ENDPOINT environment variable not set, logging disabled.")
}

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

const constructPrompt = (PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput) => {
    const qaToString = qa => `Input: ${qa.q}\n\nOutput: ${qa.a}\n\n`
    let prompt = `${PROMPT_INSTRUCTIONS}\n\n`
    prompt += PROMPT_QA_EXAMPLES.map(qaToString).join("")
    prompt += sessionHistory.map(qaToString).join("") // TODO leikkaa alusta pois QA:ta jos on liian pitkä
    prompt += `Input: ${currentUserInput}\n\n`
    prompt += `Output:`
    return prompt
}

const getResponse = async (PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput) => {
    if (currentUserInput.startsWith("!mock")) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1000));
        if (currentUserInput === "!mock1") return "moikka"
        return "Petting dogs is a great way to relax and de-stress. But why pet just any dog when you can pet a pedigree? Pedigree's line of robotic dogs are the perfect companion for any petting session. They come in all shapes and sizes, and they're programmed to respond to your touch. Plus, they never need to be walked or fed. Pedigree. Pet the future.";
    }
    const prompt = constructPrompt(PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput)
    const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: prompt,
        max_tokens: 256,
        temperature: 0.4,
    });
    return response.data.choices[0].text.replaceAll("\n", "").trim()
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'))
app.use(express.json());
app.use(cors())

app.post("/healthcheck", (req, res, next) => {
    try {
        res.send({ 'text' : 'healthcheck ok' })
    } catch (ex) {
        next(ex)
    }
});

app.post("/geept", async (req, res, next) => {
    try {
        const userId = "future" + req.body.userId
        const currentUserInput = req.body.userInput
        const sessionHistory = req.body.sessionHistory
        const output = await getResponse(PROMPT_INSTRUCTIONS, PROMPT_QA_EXAMPLES, sessionHistory, currentUserInput)
        log(userId, currentUserInput, output)
        res.send({ 'text' : output })
    } catch (ex) {
        next(ex)
    }
});

app.listen(port, () => console.log(`Future listening on port ${port}!`))