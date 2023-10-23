const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const ts = require('fs');

const readline = require('readline');
const admin = require('firebase-admin');
 const serviceAccount = require('service account path');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'db url',
});

const db = admin.firestore();
const ARABIC_FILE = 'arabic.json';
const ENGLISH_FILE = 'english.json';
const OUTPUT_FILE = 'localization.json';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function scrapeLocals(link, file) {
    try {
        const browser = await puppeteer.launch({ headless: "new" }); 
        const page = await browser.newPage();
        await page.goto(link);

        const data = await page.evaluate(() => {
            const dataMap = {};
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const id = cells[1].textContent.trim(); // 2nd cell
                    const name = cells[2].textContent.trim(); // 3rd cell
                    dataMap[id] = name;
                }
            });

            return dataMap;
        });

        await browser.close();

         await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
        console.log('Data extracted and saved to', file);
    } catch (error) {
        console.error('Error:', error);
    }
}

 

function snakeCase(text) {
    text = text.trim().replace(/\W+/g, '_');
    return text.toLowerCase();
}

async function mergeFiles(arabicFile, englishFile, outputFile) {
    try {
        const arabicData = await fs.readFile(arabicFile, 'utf-8');
        const englishData = await fs.readFile(englishFile, 'utf-8');

        const arabicMap = JSON.parse(arabicData);
        const englishMap = JSON.parse(englishData);

        const localizationMap = {};

        for (const id in englishMap) {
            if (arabicMap.hasOwnProperty(id)) {
                localizationMap[id] = {
                    arabic: arabicMap[id],
                    english: englishMap[id]
                };
            }
        }

        const combinedMap = {
            arabic: {},
            english: {}
        };

        for (const id in localizationMap) {
            const eng=localizationMap[id].english;
            const snakeCaseId =  "ptuk_"+snakeCase(eng);
            combinedMap.arabic[snakeCaseId] = localizationMap[id].arabic;
            combinedMap.english[snakeCaseId] = localizationMap[id].english;
        }

        await fs.writeFile(outputFile, JSON.stringify(combinedMap, null, 4), 'utf-8');
        console.log("Localization map created successfully.");
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
            await mergeFiles(ARABIC_FILE, ENGLISH_FILE, OUTPUT_FILE);
            console.log("Done processing", link);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function scrapeAndGenerateJSON(link) {
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.goto(link);

        const subjects = [];
        const majorElement = await page.$('body > div.page-title-area.title-img-one > div.d-table > div > div > div > ul > li:nth-child(3) > a');
        const majorValue = majorElement ? await majorElement.evaluate(node => node.textContent.trim()) : '';

        const tables = await page.$$('table');

         const startIndex = 2;
        for (let i = startIndex; i < tables.length; i++) {
            const table = tables[i];
            const rows = await table.$$('tbody tr');

            for (const row of rows) {
                const cells = await row.$$('td');

                if (cells.length >= 3) {
                    const uniID = await cells[1].evaluate(node => node.textContent.trim());
                    const name = await cells[2].evaluate(node => node.textContent.trim());
                    const nameSnakeCase = snakeCase(name);

                    const subject = {
                        uniID,
                        name: "ptuk_"+nameSnakeCase,
                        extn: "cors",
                        showinDDM: false,
                        priority: 0,
                        altName: null
                    };
                    subjects.push(subject);
                }
            }
        }

        const data = { subjects, major: "ptuk_" + snakeCase(majorValue) };
        await fs.writeFile('data.json', JSON.stringify(data, null, 2), 'utf-8');
        await browser.close();
        console.log('Data extracted and saved to data.json');
    } catch (error) {
        console.error('Error:', error);
    }
}


async function main() {
    rl.question('Enter one or more URLs (comma-separated): ', async (input) => {
        const links = input.split(',').map(link => link.trim());
        await runner(links);
        rl.question('Do you want to continue? (yes/no): ', async (answer) => {
            if (answer.toLowerCase() === 'y') {
                await addMajor();
                await addLoclas();
                process.exit(0);
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
        "parent": {"name": "ptuk_faculty_of_information_technology", "id": "RlE5RmkII31eMNAeEBxR"}
    })
    for (const cors of major.subjects) {
        const query1 = await db.collection("files").where("uniID", "==", cors.uniID).get();
        if (query1.empty) {
            cors["parents"] = [{"name": major.major, "id": id}]
            await db.collection("files").doc().set(cors);
        } else {
            await query1.docs[0].ref.update({
                "parents": admin.firestore.FieldValue.arrayUnion({
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

main().then();
