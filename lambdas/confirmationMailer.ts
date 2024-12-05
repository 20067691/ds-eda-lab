import { DynamoDBStreamHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables."
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const client = new SESClient({ region: SES_REGION });

export const handler: DynamoDBStreamHandler = async (event) => {
  console.log("Received DynamoDB Stream event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      // Only process "INSERT" events
      if (record.eventName === "INSERT" && record.dynamodb?.NewImage) {
        const newItem = record.dynamodb.NewImage;

        // Extract details from the new DynamoDB item
        const fileName = newItem.fileName?.S;
        const bucketName = newItem.bucketName?.S;

        if (!fileName || !bucketName) {
          console.warn("Missing required attributes in DynamoDB stream record.");
          continue;
        }

        console.log(`Processing new image: ${fileName} in bucket: ${bucketName}`);

        // Compose email details
        const { name, email, message }: ContactDetails = {
          name: "The Photo Album",
          email: SES_EMAIL_FROM,
          message: `Your image "${fileName}" has been successfully uploaded to the bucket "${bucketName}".`,
        };

        // Send email
        const params = sendEmailParams({ name, email, message });
        await client.send(new SendEmailCommand(params));

        console.log(`Email sent successfully for item: ${fileName}`);
      } else {
        console.log(`Skipping non-INSERT event or event without NewImage: ${record.eventName}`);
      }
    } catch (error) {
      console.error("Error processing DynamoDB Stream record:", error);
    }
  }
};

function sendEmailParams({ name, email, message }: ContactDetails): SendEmailCommandInput {
  return {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Image Upload Confirmation`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
}

function getHtmlContent({ name, email, message }: ContactDetails) {
  return `
    <html>
      <body>
        <h2>Sent from: </h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}
