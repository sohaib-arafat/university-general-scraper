const puppeteer = require('puppeteer');
const fs = require('fs');

async function main() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto('https://www.hebron.edu/index.php/en/arts-dep-en/arts-dep2/arts-dep2-courses.html');

    const englishResultMap = await extractTextFromStrongElements(page);
    saveToJson(englishResultMap, 'english_data.json');

    await clickButtonAndReload(page);

    const arabicResultMap = await extractTextFromStrongElements(page);
    saveToJson(arabicResultMap, 'arabic_data.json');

    await browser.close();
    mergeJSONFiles();
}

(async () => {
    await main();
})();

async function extractTextFromStrongElements(page) {
    const strongElements = await page.$$('strong');
    const extractedObjectsArray = [];

    for (const strongElement of strongElements) {
        const textContent = await (await strongElement.getProperty('textContent')).jsonValue();
        const hasFiveDigitNumber = /\b\d{5}\b/.test(textContent);

        const entryObject = {
            name: hasFiveDigitNumber ? textContent.replace(/\b\d{5}\b/, '').trim() : (textContent),
            id: hasFiveDigitNumber ? textContent.match(/\b\d{5}\b/)[0] : null
        };

        if (!hasFiveDigitNumber) {
            extractedObjectsArray.push(entryObject);
        } else {
            console.log('Removed 5-digit number:', entryObject.id);
            console.log('Modified String:', entryObject.name);
            extractedObjectsArray.push(entryObject);
        }
    }

    console.log('Extracted Objects Map:', processArray(extractedObjectsArray));
    return processArray(extractedObjectsArray);
}

function processArray(arr) {
    for (let i = 0; i < arr.length - 1; i++) {
        const currentMap = arr[i];
        const nextMap = arr[i + 1];

        if (currentMap.name === '') {
            if (nextMap) {
                currentMap.name = nextMap.name;
                arr.splice(i + 1, 1);
            }
        }
    }

    return arr;
}

async function clickButtonAndReload(page) {
    await page.click('#sp-language > div > div > div > div > ul > li > a');
    await page.reload({ waitUntil: 'domcontentloaded' });
}

function saveToJson(data, fileName) {
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Data saved to ${fileName}`);
}

function mergeJSONFiles() {
    const arabicData = JSON.parse(fs.readFileSync('arabic_data.json', 'utf8'));
    const englishData = JSON.parse(fs.readFileSync("english_data.json", 'utf8'));

    function mergeObjects(arabicObj, englishObj) {
        return {
            id: arabicObj.id,
            name: {
                arabic: arabicObj.name,
                english: englishObj.name
            }
        };
    }

    const mergedData = arabicData.map(arabicObj => {
        const correspondingEnglishObj = englishData.find(englishObj => englishObj.id === arabicObj.id);
        if (correspondingEnglishObj) {
            return mergeObjects(arabicObj, correspondingEnglishObj);
        } else {
            return null;
        }
    }).filter(obj => obj !== null);

    fs.writeFileSync("data.json", JSON.stringify(mergedData, null, 2));
}
