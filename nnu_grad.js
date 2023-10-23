const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const ts = require('fs');

const readline = require('readline');
let admin = require("firebase-admin");


admin.initializeApp({
    credential: admin.credential.cert("service.json")
});

const db = admin.firestore();
const ARABIC_FILE = 'arabic.txt';
const ENGLISH_FILE = 'english.txt';
const OUTPUT_FILE = 'localization.json';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function scrapeLocals(link, file) {
    try {
        const browser = await puppeteer.launch({headless: "new"});
        const page = await browser.newPage();
        await page.goto(link);

        const names = await page.evaluate(() => {
            const names = [];
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const name = cells[1].textContent.trim();
                    names.push(name);
                }
            });

            return names;
        });

        await browser.close();

        await fs.writeFile(file, names.join('\n'), 'utf-8');
        console.log('Names extracted and saved to', file);
    } catch (error) {
        console.error('Error:', error);
    }
}

function snakeCase(text) {
    text = text.trim().replace(/\W+/g, '_');
    return text.toLowerCase();
}

function mergeFiles(arabicFile, englishFile, outputFile) {
    try {
        const arabicData = fs.readFile(arabicFile, 'utf-8');
        const englishData = fs.readFile(englishFile, 'utf-8');

        Promise.all([arabicData, englishData]).then(async ([arabicContent, englishContent]) => {
            const arabicLines = arabicContent.split('\n');
            const englishLines = englishContent.split('\n');

            if (arabicLines.length !== englishLines.length) {
                console.log("Error: The number of lines in the files does not match.");
                return;
            }

            const arabicMap = {};
            const englishMap = {};

            for (let i = 0; i < englishLines.length; i++) {
                const englishText = englishLines[i].trim();
                const arabicText = arabicLines[i].trim();

                if (englishText) {
                    const key = snakeCase(englishText);
                    arabicMap[key] = arabicText;
                    englishMap[key] = englishText;
                }
            }

            const outputData = {
                arabic: arabicMap,
                english: englishMap
            };

            await fs.writeFile(outputFile, JSON.stringify(outputData, null, 4), 'utf-8');
            console.log("Localization maps created successfully.");
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

async function runner(links) {
    try {
        for (const link of links) {
            await scrapeAndGenerateJSON(link);
            await sleep(2000);
            await scrapeLocals(link, ENGLISH_FILE);
            await sleep(2000);
            await scrapeLocals(link.replace("en", "ar"), ARABIC_FILE);
            mergeFiles(ARABIC_FILE, ENGLISH_FILE, OUTPUT_FILE);
            console.log("Done processing", link);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function scrapeAndGenerateJSON(link) {
    try {
        const browser = await puppeteer.launch({headless: "new"});
        const page = await browser.newPage();
        await page.goto(link);

        const subjects = [];
        const majorElement = await page.$('#page-top > div.najah > div.container-fluid.px-0 > div:nth-child(4) > div > div.row > div.col-md-17.col-md-push-7.content > div.f24.dark-blue.margin-btm-md');
        const majorValue = majorElement ? await majorElement.evaluate(node => node.textContent.trim()) : '';

        const tables = await page.$$('table');

        for (const table of tables) {
            const rows = await table.$$('tbody tr');

            for (const row of rows) {
                const cells = await row.$$('td');

                if (cells.length >= 2) {
                    const uniId = await cells[0].evaluate(node => node.textContent.trim());
                    const name = await cells[1].evaluate(node => node.textContent.trim());
                    const nameSnakeCase = snakeCase(name);

                    const subject = {
                        uniId,
                        name: nameSnakeCase,
                        extn: "cors",
                        showinDDM: false,
                        priority: 0,
                        altName: null
                    };
                    subjects.push(subject);
                }
            }
        }

        const data = {subjects, major: "grad_" + snakeCase(majorValue)};
        await fs.writeFile('data.json', JSON.stringify(data, null, 2), 'utf-8');
        await browser.close();
        console.log('Data extracted and saved to data.json');
    } catch (error) {
        console.error('Error:', error);
    }
}

async function main() {
    rl.question('Enter one or more URLs (comma-separated): ', async (input) => {
        const links = input.split(',').map(link => link.trim()+"study-plan/");
         await runner(links);
        rl.question('Do you want to continue? (yes/no): ', async (answer) => {
            if (answer.toLowerCase() === 'y') {
                await addMajor();
                await addLoclas();
                process.exit(0); // Quit
            } else {
                console.log('Quitting...');
                process.exit(0); // Quit
            }
        });
    });

}

function readJsonFile(filename) {
    try {
         const data = ts.readFileSync(filename, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading or parsing JSON file:', error);
        return null;
    }
}

async function addMajor() {
    const major = await readJsonFile("data.json")
    const {id} = await db.collection("files").add({
        "name": major['major'],
        "extn": "mjor",
        "showinDDM": true,
        "uniID": null,
        "priority": 0,
        "altName": null,
        "parent": {"name": "faculty_of_graduate_studies", "id": "hHAPRX60s2zxPsgjFNzx"}
    })
    for (const cors of major.subjects) {
        const query1 = await db.collection("files").where("uniID", "==", cors.uniId).get();
        if (query1.empty) {
            cors["parents"] = [{"name": major.major, "id": id}]
            await db.collection("files").doc().set(cors);
        } else {
            await query1.docs[0].ref.update({
                "parents": FirebaseFirestore.FieldValue.arrayUnion({
                    "name": major.major,
                    "id": id
                })
            })
        }
    }
}

async function addLoclas() {
    const loc = await readJsonFile("localization.json")
    await db.collection("localization")
        .doc("ar_SA").update(loc['arabic']);

    await db.collection("localization")
        .doc("en_US").update(loc['english']);

}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

main();
