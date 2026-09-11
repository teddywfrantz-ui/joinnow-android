import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';

export default function TokenTestPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const [tokens, setTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

  // Function to generate and fetch test tokens
  const fetchTestToken = async () => {
    try {
      const response = await fetch('/api/generate-test-token');
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate test token');
      }
      
      const data = await response.json();
      setTokens(data);
      
      // Log tokens to console for demonstration
      console.log('----------- JWT TOKENS -----------');
      console.log('User ID:', data.userId);
      console.log('Username:', data.username);
      console.log('Access Token:', data.accessToken);
      console.log('Refresh Token:', data.refreshToken);
      console.log('---------------------------------');
      
      toast({
        title: 'Tokens Generated',
        description: 'JWT tokens have been generated and logged to the console.',
      });
    } catch (error) {
      console.error('Token generation error:', error);
      toast({
        title: 'Token Generation Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>JWT Token Test</CardTitle>
          <CardDescription>
            Generate and view JWT tokens in the console
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <>
              <div className="mb-4 p-4 border rounded bg-green-50 dark:bg-green-900/20">
                <h3 className="font-semibold">Logged in as:</h3>
                <p>User ID: {user.id}</p>
                <p>Username: {user.username}</p>
              </div>
              
              <Button className="w-full mb-2" onClick={fetchTestToken}>
                Generate JWT Tokens
              </Button>
              
              <p className="text-sm text-muted-foreground">
                Click the button to generate JWT tokens for your current session.
                The tokens will be logged to the browser console.
              </p>
              
              {tokens && (
                <div className="mt-4 p-4 border rounded bg-gray-50 dark:bg-gray-900">
                  <h3 className="font-semibold mb-2">Tokens Generated</h3>
                  <p className="text-sm">Tokens have been logged to the browser console.</p>
                  <p className="text-xs mt-2">
                    Open the browser console (F12 or Ctrl+Shift+J) to view the tokens.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 border rounded bg-yellow-50 dark:bg-yellow-900/20">
              <h3 className="font-semibold mb-2">Not Logged In</h3>
              <p className="text-sm mb-4">
                You need to be logged in to generate JWT tokens.
              </p>
              <Button variant="outline" onClick={() => window.location.href = '/auth'}>
                Go to Login Page
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
            Back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}