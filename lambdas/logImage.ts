/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";

const s3 = new S3Client();
const dynamodb = new DynamoDBClient({});

// Environment variables
const TABLE_NAME = process.env.IMAGE_TABLE_NAME!; // DynamoDB table name

// Helper to validate file type
function isValidImageType(key: string): boolean {
  const validExtensions = [".jpeg", ".jpg", ".png"];
  return validExtensions.some((ext) => key.toLowerCase().endsWith(ext));
}

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      // Parse the SQS message
      const recordBody = JSON.parse(record.body);
      const snsMessage = JSON.parse(recordBody.Message);

      if (snsMessage.Records) {
        console.log("Record body ", JSON.stringify(snsMessage));

        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const srcBucket = s3e.bucket.name;
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
          const eventName = messageRecord.eventName;

          console.log(`Processing file: s3://${srcBucket}/${srcKey}, Event: ${eventName}`);

          if (eventName.startsWith("ObjectCreated")) {
            // Handle ObjectCreated events
            console.log(`Handling upload for: ${srcKey}`);

            // Validate file type
            if (!isValidImageType(srcKey)) {
              throw new Error(`Invalid file type for object: ${srcKey}`);
            }

            // Log valid image metadata to DynamoDB
            const dynamoParams = {
              TableName: TABLE_NAME,
              Item: {
                fileName: { S: srcKey }, // Primary key
                uploadTime: { S: new Date().toISOString() },
                bucketName: { S: srcBucket },
                status: { S: "valid" },
              },
            };

            await dynamodb.send(new PutItemCommand(dynamoParams));
            console.log(`Image metadata logged to DynamoDB for: ${srcKey}`);
          } else if (eventName.startsWith("ObjectRemoved")) {
            // Handle ObjectRemoved events
            console.log(`Handling deletion for: ${srcKey}`);

            const deleteParams = {
              TableName: TABLE_NAME,
              Key: {
                fileName: { S: srcKey }, // Primary key
              },
            };

            await dynamodb.send(new DeleteItemCommand(deleteParams));
            console.log(`Deleted item for ${srcKey} from DynamoDB`);
          } else {
            console.log(`Unhandled event type: ${eventName}`);
          }
        }
      }
    } catch (error) {
      console.error("Error processing file:", error);
      // Errors will result in the message being reprocessed or sent to the DLQ
      throw error;
    }
  }
};
