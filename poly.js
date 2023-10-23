const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const ts = require('fs');
 const readline = require('readline');
const admin = require('firebase-admin');
const serviceAccount = require('path to service account');


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
        const browser = await puppeteer.launch({headless: "new"});
        const page = await browser.newPage();
        await page.goto(link);


        await page.waitForSelector("#program_plan");


        await page.click("#program_plan");
        await sleep(1300)
        const data = await page.evaluate(() => {
            const dataMap = {};
            const tableRows = document.querySelectorAll('table tbody tr');

            tableRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const id = cells[0].textContent.trim(); // 1st cell
                    dataMap[id] = cells[1].textContent.trim();
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

async function mergeFiles(arabicFile, englishFile, outputFile, link) {
    try {
        const browser = await puppeteer.launch({headless: "new"});
        const page = await browser.newPage();
        await page.goto(link);

        let majorElement = await page.$('body > div.main-container.container > div > section > h1');
        const majorValueEn = majorElement ? await majorElement.evaluate(node => node.textContent.trim()) : '';
        link = link.replace("en", "ar")
        await page.goto(link);
        majorElement = await page.$('body > div.main-container.container > div > section > h1');
        const majorValueAr = majorElement ? await majorElement.evaluate(node => node.textContent.trim()) : '';
        const arabicData = await fs.readFile(arabicFile, 'utf-8');
        const englishData = await fs.readFile(englishFile, 'utf-8');

        const arabicMap = JSON.parse(arabicData);
        const englishMap = JSON.parse(englishData);

        const localizationMap = {};

        for (const id in englishMap) {
            if (arabicMap.hasOwnProperty(id)) {
                if (englishMap[id] === '' || arabicMap[id] === '')
                    continue

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
        combinedMap['arabic']["ppu_" + snakeCase(majorValue)] = majorValueAr;
        combinedMap['english']["ppu_" + snakeCase(majorValue)] = majorValueEn;
        for (const id in localizationMap) {
            const eng = localizationMap[id].english;
            const snakeCaseId = "ppu_" + snakeCase(eng);
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
        for (let link of links) {
            await scrapeAndGenerateJSON(link);
            await sleep(2000);
            await scrapeLocals(link, ENGLISH_FILE);
            await sleep(2000);
            await scrapeLocals(link.replace('en','ar'), ARABIC_FILE);
            await mergeFiles(ARABIC_FILE, ENGLISH_FILE, OUTPUT_FILE, link);
            console.log("Done processing", majorValue);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

let majorValue = '';

async  function appendValueToFile(filePath, valueToAppend) {
     await  fs.appendFile(filePath, `${valueToAppend}\n`, (err) => {
        if (err) {
            console.error('Error appending to file:', err);
        } else {
            console.log('Value appended to file successfully.');
        }
    });
}

async function scrapeAndGenerateJSON(link) {
    try {
        const browser = await puppeteer.launch({headless: "new"});
        const page = await browser.newPage();
        await page.goto(link);
        const majorElement = await page.$('body > div.main-container.container > div > section > h1');
        majorValue = majorElement ? await majorElement.evaluate(node => node.textContent.trim()) : '';
        await page.waitForSelector("#program_plan");


        await page.click("#program_plan");
        await sleep(700)
        const subjects = [];

        const tables = await page.$$('table');

        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const rows = await table.$$('tbody tr');

            for (const row of rows) {
                const cells = await row.$$('td');

                if (cells.length >= 2) {
                    const uniID = await cells[0].evaluate(node => node.textContent.trim());
                    const name = await cells[1].evaluate(node => node.textContent.trim());
                    const nameSnakeCase = "ppu_"+snakeCase(name);
                    const subject = {
                        uniID,
                        name: nameSnakeCase,
                        extn: "cors",
                        showInDDM: false,
                        priority: 0,
                        altName: uniID
                    };
                    subjects.push(subject);
                }
            }
        }

        const data = {subjects, major: "ppu_" + snakeCase(majorValue)}; // Add the appropriate value for major
        await fs.writeFile('data.json', JSON.stringify(data, null, 2), 'utf-8');
        await browser.close();
        console.log('Data extracted and saved to data.json');
    } catch (error) {
        console.error('Error:', error);
    }
}
async function searchFileForString(filePath, searchString) {
   await  fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        // Check if the string exists in the file
       return  data.includes(searchString);


    });
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
async  function addObjectToFile(filePath, objectKey, parents) {
   await  fs.readFile(filePath, 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        let jsonData;
        try {
             jsonData = JSON.parse(data);
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            return;
        }

         if (jsonData.hasOwnProperty(objectKey)) {
             jsonData[objectKey].parents.push(parents);
        } else {
             jsonData[objectKey] = {
                parents: [parents],
            };
        }

         await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error writing to file:', writeErr);
            } else {
                console.log('Object added to file successfully.');
            }
        });
    });
}


async function addMajor() {
    const major = await readJsonFile("data.json")
    const {id} = await db.collection("files").add({
        "name": major['major'],
        "extn": "mjor",
        "showInDDM": true,
        "uniID": null,
        "priority": 0,
        "altName": null,
        "parent": {"name": "ppu_college_of_applied_professions", "id": "GoMhfZH8jt8GyLTCvlny"}
    })
    for (const cors of major.subjects) {
        if(cors.name === "ppu_" || cors.name === "ppu_ " || cors.name === ""){
            await addObjectToFile("miss.json",cors.uniID,{"id":id,"name":major['major']})
            continue
        }
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
