import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({});
const TABLE_NAME = process.env.IMAGE_TABLE_NAME!;

// Allowed metadata attributes
const allowedAttributes = ["Caption", "Date", "Photographer"];

export const handler = async (event: any) => {
  console.log("Received event: ", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      // Parse the SNS message
      const message = JSON.parse(record.Sns.Message);

      // Validate metadata type
      const metadataType = record.Sns.MessageAttributes?.metadata_type?.Value;
      if (!allowedAttributes.includes(metadataType)) {
        throw new Error(`Invalid metadata type: ${metadataType}`);
      }

      const { id, value } = message;
      console.log(`Updating metadata for ${id}: ${metadataType} = ${value}`);

      // Prepare the DynamoDB update
      const params = {
        TableName: TABLE_NAME,
        Key: { fileName: { S: id } },
        UpdateExpression: `SET #attr = :val`,
        ExpressionAttributeNames: {
          "#attr": metadataType,
        },
        ExpressionAttributeValues: {
          ":val": { S: value },
        },
      };

      // Update DynamoDB
      await dynamo.send(new UpdateItemCommand(params));
      console.log(`Metadata updated for ${id}: ${metadataType} = ${value}`);
    } catch (error) {
      console.error("Error processing metadata update:", error);
    }
  }
};
